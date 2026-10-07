// Detail drawer for one creative stack: preview, KPIs, daily spend and ROAS, where Meta
// spent (audience segments), placements, video retention, name-detected tags, and the
// ads that share the visual.

import { t } from './i18n.js';
import * as fmt from './format.js';
import { h, svgIcon } from './ui.js';
import { columnChart, lineChart, stackedBar, barList } from './charts.js';
import { SEGMENT_COLORS } from './funnel.js';
import { DIMENSIONS } from './naming.js';

const PLATFORM = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads', whatsapp: 'WhatsApp' };
const POSITION = {
  feed: 'Feed',
  facebook_reels: 'Reels',
  instagram_reels: 'Reels',
  instagram_stories: 'Stories',
  facebook_stories: 'Stories',
  story: 'Stories',
  instagram_explore: 'Explore',
  instagram_explore_grid_home: 'Explore home',
  marketplace: 'Marketplace',
  video_feeds: 'Video feeds',
  right_hand_column: 'Right column',
  search: 'Search',
  instream_video: 'In-stream video',
  classic: '',
  an_classic: '',
  rewarded_video: 'Rewarded video',
  messenger_inbox: 'Inbox',
  instagram_profile_feed: 'Profile feed',
  facebook_reels_overlay: 'Reels overlay',
  threads_feed: 'Feed',
};

export function placementLabel(p) {
  const platform = PLATFORM[p.platform] || p.platform || '';
  const pos = POSITION[p.position] ?? String(p.position || '').replace(/_/g, ' ');
  return [platform, pos].filter(Boolean).join(' ');
}

function section(title, sub, ...body) {
  return h('section', { class: 'section' }, h('h3', { text: title }), sub ? h('p', { class: 'sub', text: sub }) : null, ...body);
}

function kpi(label, value) {
  return h('div', { class: 'kpi' }, h('span', { text: label }), h('b', { text: value }));
}

function statusLabel(status) {
  const key = 'status.' + status;
  const label = t(key);
  if (label !== key) return label;
  const text = String(status).toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const RETENTION_LABELS = ['0s', '1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', '10s', '11s', '12s', '13s', '14s', '15–20s', '20–25s', '25–30s', '30–40s', '40–50s', '50–60s', '60s+'];

/**
 * @param {HTMLElement} drawer
 * @param {{stack:Object, group:Object|null, model:Object, live:boolean, preview:(ad:Object, width:number)=>Promise<HTMLElement>,
 *          loadDetail:(ads:Object[])=>Promise<Object>, onClose:Function}} ctx
 */
export function renderDetail(drawer, ctx) {
  const { stack, model } = ctx;
  const currency = model.account?.currency || 'USD';
  const m = stack.metrics;
  const rep = stack.rep;
  const level = stack.funnel?.level;
  drawer.hidden = false;
  drawer.replaceChildren();

  const levelColor = { top: 'var(--level-top)', middle: 'var(--level-middle)', bottom: 'var(--level-bottom)', reactivation: 'var(--level-reactivation)' }[level];
  const estimated = stack.funnel && stack.funnel.method !== 'segments';
  const head = h(
    'header',
    { class: 'detail-head' },
    h(
      'div',
      { class: 'titles' },
      h(
        'span',
        { class: 'level-chip' },
        h('span', { class: 'dot', style: { background: levelColor } }),
        t('level.' + level),
        estimated ? h('span', { class: 'est', text: stack.funnel.method === 'names' ? t('tt.names') : t('tt.delivery') }) : null,
      ),
      h('h2', { id: 'detail-title', text: rep.name || rep.id }),
      h('div', { class: 'crumbs', text: [rep.campaign?.name, rep.adset?.name].filter(Boolean).join(' › ') }),
    ),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('d.close'), title: t('d.close'), onclick: ctx.onClose }, svgIcon('close')),
  );

  const body = h('div', { class: 'detail-body' });
  drawer.append(head, body);
  const width = () => Math.max(240, body.clientWidth - 32);

  // Preview and stack note.
  const thumb = h('div', { class: 'thumb' });
  ctx.preview(rep, 264).then((node) => node && thumb.appendChild(node));
  const stackNote =
    stack.count > 1
      ? h('div', { class: 'stack-note' }, h('span', { class: 'big', text: fmt.integer(stack.count) + '×' }), h('b', { text: t('d.stack', { n: stack.count }) }), h('span', { class: 'warn', text: t('d.stackNote') }))
      : h('div', { class: 'stack-note' }, h('span', { text: t('d.single') }));
  body.appendChild(h('div', { class: 'detail-media' }, thumb, stackNote));

  // KPIs.
  const isVideo = stack.ads.some((a) => a.creative?.type === 'video') || m.video3s > 0;
  const kpis = [
    kpi(t('kpi.spend'), fmt.money(m.spend, currency)),
    kpi(t('kpi.roas'), fmt.roas(m.roas)),
    kpi(t('kpi.purchases'), fmt.integer(m.purchases)),
    kpi(t('kpi.cpa'), m.cpa ? fmt.money(m.cpa, currency, { exact: true }) : '—'),
    kpi(t('kpi.ctr'), fmt.percent(m.ctr, 2)),
    kpi(t('kpi.cpm'), m.cpm ? fmt.money(m.cpm, currency, { exact: true }) : '—'),
    kpi(t('kpi.frequency'), fmt.ratio(m.frequency)),
    kpi(t('kpi.cpmr'), m.cpmr ? fmt.money(m.cpmr, currency, { exact: true }) : '—'),
  ];
  if (isVideo) kpis.push(kpi(t('kpi.hookRate'), fmt.percent(m.hookRate, 1)), kpi(t('kpi.holdRate'), fmt.percent(m.holdRate, 1)));
  // Pick a column count the tiles fill exactly: 8 tiles in fours, 10 in fives.
  body.appendChild(h('div', { class: 'kpis' + (kpis.length % 5 === 0 ? ' kpis-5' : '') }, ...kpis));

  // Daily + placements + video arrive async.
  const dailySlot = h('div', {}, h('div', { class: 'skeleton' }));
  const placementSlot = h('div', {}, h('div', { class: 'skeleton', style: { height: '90px' } }));
  const videoSlot = isVideo ? h('div', {}, h('div', { class: 'skeleton', style: { height: '100px' } })) : null;

  body.appendChild(section(t('d.daily'), null, dailySlot));

  // Segments (from the snapshot, no extra request).
  const seg = stack.segments;
  const segTotal = seg ? seg.new + seg.engaged + seg.existing : 0;
  if (seg && segTotal > 0 && stack.funnel?.method === 'segments') {
    body.appendChild(
      section(
        t('d.segments'),
        t('d.segmentsSub'),
        stackedBar({
          width: width(),
          label: t('d.segments'),
          format: (v) => fmt.money(v, currency),
          segments: [
            { label: t('seg.new'), value: seg.new, color: SEGMENT_COLORS.new },
            { label: t('seg.engaged'), value: seg.engaged, color: SEGMENT_COLORS.engaged },
            { label: t('seg.existing'), value: seg.existing, color: SEGMENT_COLORS.existing },
          ],
        }),
      ),
    );
  } else {
    const ctxF = model.ctx;
    const text =
      stack.funnel?.method === 'names'
        ? t('d.namesPlaced', { names: [...stack.campaigns, ...stack.adsets].slice(0, 2).join(', ') })
        : t('d.noSegments', {
            f: fmt.ratio(m.frequency),
            c: fmt.money(m.cpmr, currency, { exact: true }),
            mf: fmt.ratio(ctxF.medianFreq),
            mc: fmt.money(ctxF.medianCpmr, currency, { exact: true }),
          });
    body.appendChild(section(t('d.segments'), null, h('p', { class: 'note', text })));
  }

  body.appendChild(section(t('d.placements'), t('d.placementsSub'), placementSlot));
  if (videoSlot) body.appendChild(section(t('d.video'), null, videoSlot));

  // Tags.
  const tags = DIMENSIONS.map((dim) => {
    const value = stack.tags?.[dim];
    if (!value) return null;
    const src = rep.tags?.source?.[dim];
    const srcLabel = src === 'copy' ? t('d.src.copy') : src === 'creative' ? t('d.src.creative') : null;
    return h('span', { class: 'tag' }, h('span', { text: t('arr.' + dim) }), h('b', { text: value }), srcLabel ? h('span', { text: srcLabel }) : null);
  }).filter(Boolean);
  if (tags.length) body.appendChild(section(t('d.tags'), null, h('div', { class: 'tags' }, ...tags)));

  // Members.
  if (stack.count > 1) {
    body.appendChild(
      section(
        t('d.ads'),
        null,
        h(
          'ul',
          { class: 'ad-list' },
          ...stack.ads.map((a) =>
            h(
              'li',
              {},
              h('span', { class: 'al-name' }, a.name || a.id, h('span', { class: 'al-sub', text: [a.status ? statusLabel(a.status) : null, a.campaign?.name].filter(Boolean).join(' · ') })),
              h('span', { class: 'al-num', text: fmt.money(a.metrics.spend, currency) }),
              h('span', { class: 'al-num', text: fmt.roas(a.metrics.purchaseValue / a.metrics.spend) }),
            ),
          ),
        ),
      ),
    );
  }

  if (ctx.live && model.account?.id) {
    const act = String(model.account.id).replace(/^act_/, '');
    const href = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(act)}&selected_ad_ids=${stack.ads.map((a) => encodeURIComponent(a.id)).join('%2C')}`;
    body.appendChild(h('a', { class: 'btn', href, target: '_blank', rel: 'noopener' }, svgIcon('external'), t('d.openAds')));
  }

  ctx
    .loadDetail(stack.ads, { video: isVideo })
    .then((detail) => {
      if (drawer.dataset.stack !== stack.id) return;
      fillDaily(dailySlot, detail, currency, width());
      fillPlacements(placementSlot, detail, currency, width());
      if (videoSlot) fillVideo(videoSlot, detail, m, width());
    })
    .catch((err) => {
      const msg = h('p', { class: 'note', text: t('d.error', { msg: err.message }) });
      dailySlot.replaceChildren(msg);
      placementSlot.replaceChildren();
      if (videoSlot) videoSlot.replaceChildren();
    });
  drawer.dataset.stack = stack.id;
}

function fillDaily(slot, detail, currency, width) {
  const daily = detail.daily || [];
  if (!daily.length) {
    slot.replaceChildren(h('p', { class: 'note', text: '—' }));
    return;
  }
  const spend = columnChart({
    width,
    height: 120,
    label: t('d.daily'),
    color: '#3987e5',
    format: (v) => fmt.money(v, currency, { exact: true }),
    axisFormat: (v) => fmt.money(v, currency),
    data: daily.map((d) => ({ label: fmt.shortDate(d.date), value: d.spend || 0 })),
  });
  const roasData = daily.map((d) => ({ label: fmt.shortDate(d.date), value: d.spend > 0 ? (d.purchaseValue || 0) / d.spend : null }));
  const roas = lineChart({
    width,
    height: 104,
    label: t('d.dailyRoas'),
    color: '#199e70',
    format: (v) => fmt.roas(v),
    axisFormat: (v) => fmt.ratio(v, Number.isInteger(v) ? 0 : Number.isInteger(v * 10) ? 1 : 2),
    data: roasData,
  });
  slot.replaceChildren(spend, h('h3', { text: t('d.dailyRoas'), style: { margin: '14px 0 8px', fontSize: '12px', color: 'var(--ink-2)' } }), roas);
}

function fillPlacements(slot, detail, currency, width) {
  const rows = (detail.placements || []).filter((p) => p.spend > 0).slice(0, 7);
  if (!rows.length) {
    slot.replaceChildren(h('p', { class: 'note', text: '—' }));
    return;
  }
  const total = (detail.placements || []).reduce((s, p) => s + (p.spend || 0), 0) || 1;
  slot.replaceChildren(
    barList({
      width,
      label: t('d.placements'),
      color: '#3987e5',
      format: (v) => fmt.percent(v / total, 0),
      rows: rows.map((p) => ({ label: placementLabel(p), value: p.spend, note: fmt.money(p.spend, currency) })),
    }),
  );
}

function fillVideo(slot, detail, m, width) {
  const v = detail.video;
  if (!v) {
    slot.replaceChildren(h('p', { class: 'note', text: t('d.noVideo') }));
    return;
  }
  let chart;
  if (Array.isArray(v.curve) && v.curve.length > 3) {
    chart = lineChart({
      width,
      height: 120,
      label: t('d.video'),
      color: '#d55181',
      yMax: 100,
      format: (x) => Math.round(x) + '%',
      axisFormat: (x) => Math.round(x) + '%',
      data: v.curve.map((value, i) => ({ label: RETENTION_LABELS[i] || i + 's', value })),
    });
  } else {
    const base = v.video3s || m.video3s || 0;
    const pts = [
      ['3s', base],
      ['25%', v.p25],
      ['50%', v.p50],
      ['75%', v.p75],
      ['95%', v.p95],
      ['100%', v.p100],
    ];
    chart = lineChart({
      width,
      height: 120,
      label: t('d.video'),
      color: '#d55181',
      yMax: 100,
      format: (x) => Math.round(x) + '%',
      axisFormat: (x) => Math.round(x) + '%',
      data: pts.map(([label, n]) => ({ label, value: base > 0 ? ((n || 0) / base) * 100 : null })),
    });
  }
  const hook = v.impressions > 0 ? v.video3s / v.impressions : m.hookRate;
  const hold = v.video3s > 0 ? v.thruplays / v.video3s : m.holdRate;
  const sub = Array.isArray(v.curve) && v.curve.length > 3 ? t('d.videoSub') : t('d.videoQuartiles');
  slot.replaceChildren(
    h('p', { class: 'sub', text: sub }),
    chart,
    h(
      'div',
      { class: 'stat-row' },
      h('span', {}, t('kpi.hookRate'), h('b', { text: fmt.percent(hook, 1) })),
      h('span', {}, t('kpi.holdRate'), h('b', { text: fmt.percent(hold, 1) })),
      v.avgWatchSeconds ? h('span', {}, t('d.avgWatch'), h('b', { text: fmt.ratio(v.avgWatchSeconds, 1) + 's' })) : null,
    ),
  );
}

export function closeDetail(drawer) {
  drawer.hidden = true;
  drawer.replaceChildren();
  delete drawer.dataset.stack;
}
