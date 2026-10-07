// Turns Marketing API responses into the snapshot the app draws: one record per ad with
// its creative, delivery metrics and spend by audience segment (new / engaged / existing).

import { normalizeSegmentKey } from '../public/js/funnel.js';

const PURCHASE_TYPES = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_web_purchase',
  'onsite_web_app_purchase',
  'onsite_app_purchase',
  'app_custom_event.fb_mobile_purchase',
];

export const AD_INSIGHT_FIELDS = [
  'ad_id',
  'ad_name',
  'adset_id',
  'adset_name',
  'campaign_id',
  'campaign_name',
  'objective',
  'spend',
  'impressions',
  'reach',
  'clicks',
  'inline_link_clicks',
  'actions',
  'action_values',
  'video_thruplay_watched_actions',
  'video_p25_watched_actions',
  'video_p50_watched_actions',
  'video_p75_watched_actions',
  'video_p95_watched_actions',
  'video_p100_watched_actions',
];
const OPTIONAL_VIDEO_FIELDS = AD_INSIGHT_FIELDS.filter((f) => f.startsWith('video_'));

const CREATIVE_FIELDS = 'id,name,object_type,thumbnail_url,image_url,image_hash,video_id,title,body,object_story_spec,asset_feed_spec';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Sum of an actions-style array for one action type. */
export function actionValue(list, type) {
  if (!Array.isArray(list)) return 0;
  return list.filter((a) => a.action_type === type).reduce((s, a) => s + num(a.value), 0);
}

/** First purchase action type present, so overlapping types are not double counted. */
export function purchases(actions, values) {
  for (const type of PURCHASE_TYPES) {
    const hasCount = Array.isArray(actions) && actions.some((a) => a.action_type === type);
    const hasValue = Array.isArray(values) && values.some((a) => a.action_type === type);
    if (hasCount || hasValue) return { count: actionValue(actions, type), value: actionValue(values, type), type };
  }
  return { count: 0, value: 0, type: null };
}

function sumVideoField(list) {
  if (!Array.isArray(list)) return 0;
  return list.reduce((s, a) => s + num(a.value), 0);
}

/** Reads what kind of creative this is and which asset identifies its visual. */
export function describeCreative(c = {}) {
  const oss = c.object_story_spec || {};
  const link = oss.link_data || {};
  const video = oss.video_data || {};
  const afs = c.asset_feed_spec || {};
  const afsVideos = Array.isArray(afs.videos) ? afs.videos : [];
  const afsImages = Array.isArray(afs.images) ? afs.images : [];
  const children = Array.isArray(link.child_attachments) ? link.child_attachments : [];

  const videoId = c.video_id || video.video_id || afsVideos[0]?.video_id || null;
  const imageHash = c.image_hash || link.image_hash || afsImages[0]?.hash || null;

  let type = 'image';
  if (oss.template_data || c.object_type === 'PRODUCT_SET') type = 'dynamic';
  else if (children.length > 1) type = 'carousel';
  else if (afsImages.length + afsVideos.length > 1) type = afsVideos.length ? 'video' : 'flexible';
  else if (videoId || c.object_type === 'VIDEO') type = 'video';

  const assetKey = videoId ? 'v:' + videoId : imageHash ? 'i:' + imageHash : c.id ? 'c:' + c.id : null;
  const imageUrl = c.image_url || link.picture || video.image_url || afsVideos[0]?.thumbnail_url || null;
  return {
    id: c.id || null,
    type,
    assetKey,
    videoId,
    imageUrl,
    thumbUrl: c.thumbnail_url || imageUrl,
    aspect: null,
    title: c.title || link.name || video.title || null,
    body: c.body || link.message || video.message || null,
  };
}

export async function fetchAccounts(client) {
  const rows = await client.paged('me/adaccounts', { fields: 'id,account_id,name,currency,timezone_name,account_status', limit: 200 });
  return rows
    .map((a) => ({ id: a.id, name: a.name || a.account_id, currency: a.currency, timezone: a.timezone_name, status: a.account_status }))
    .sort((a, b) => (a.status === 1 ? 0 : 1) - (b.status === 1 ? 0 : 1) || String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {ReturnType<import('./meta-client.mjs').createMetaClient>} client
 * @param {{account:string, since:string, until:string}} q
 */
export async function fetchSnapshot(client, { account, since, until }) {
  const timeRange = { since, until };
  const info = await client.get(account, { fields: 'id,name,currency,timezone_name' });

  const base = { level: 'ad', time_range: timeRange, limit: 500, use_unified_attribution_setting: true };
  const { rows, dropped } = await client.insights(account, { ...base, fields: AD_INSIGHT_FIELDS.join(',') }, { optionalFields: OPTIONAL_VIDEO_FIELDS });

  // Spend by audience segment. Only some campaigns report it; failures are not fatal.
  const segments = new Map();
  let segmentsAvailable = false;
  let segmentError = null;
  try {
    const seg = await client.insights(account, { ...base, fields: 'ad_id,spend', breakdowns: 'user_segment_key' });
    for (const r of seg.rows) {
      const key = normalizeSegmentKey(r.user_segment_key);
      if (!key) continue;
      if (!segments.has(r.ad_id)) segments.set(r.ad_id, { new: 0, engaged: 0, existing: 0 });
      segments.get(r.ad_id)[key] += num(r.spend);
      segmentsAvailable = true;
    }
  } catch (err) {
    segmentError = err.message;
  }

  const adIds = rows.map((r) => r.ad_id);
  const adNodes = await client.byIds(adIds, 'id,name,status,effective_status,created_time,creative{id}');
  const creativeIds = [...adNodes.values()].map((a) => a.creative?.id).filter(Boolean);
  const creatives = await client.byIds(creativeIds, CREATIVE_FIELDS, { thumbnail_width: 480, thumbnail_height: 480 });

  const ads = rows.map((r) => {
    const node = adNodes.get(r.ad_id) || {};
    const creative = describeCreative(creatives.get(node.creative?.id) || { id: node.creative?.id });
    const p = purchases(r.actions, r.action_values);
    return {
      id: r.ad_id,
      name: r.ad_name || node.name || r.ad_id,
      status: node.effective_status || node.status || null,
      createdTime: node.created_time || null,
      campaign: { id: r.campaign_id, name: r.campaign_name, objective: r.objective },
      adset: { id: r.adset_id, name: r.adset_name },
      creative,
      metrics: {
        spend: num(r.spend),
        impressions: num(r.impressions),
        reach: num(r.reach),
        clicks: num(r.clicks),
        linkClicks: num(r.inline_link_clicks),
        purchases: p.count,
        purchaseValue: p.value,
        video3s: actionValue(r.actions, 'video_view'),
        thruplays: sumVideoField(r.video_thruplay_watched_actions),
        p25: sumVideoField(r.video_p25_watched_actions),
        p50: sumVideoField(r.video_p50_watched_actions),
        p75: sumVideoField(r.video_p75_watched_actions),
        p95: sumVideoField(r.video_p95_watched_actions),
        p100: sumVideoField(r.video_p100_watched_actions),
      },
      segments: segments.get(r.ad_id) || null,
    };
  });

  return {
    source: 'meta',
    account: { id: info.id || account, name: info.name || account, currency: info.currency || 'USD', timezone: info.timezone_name || null },
    range: { since, until },
    generatedAt: new Date().toISOString(),
    segmentsAvailable,
    notes: { droppedFields: dropped, segmentError },
    ads,
  };
}
