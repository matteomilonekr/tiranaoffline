// Detail data for one creative stack: daily spend and revenue, placements, and video
// retention, aggregated across every ad in the stack with one filtered account report.

import { actionValue, purchases } from './meta-snapshot.mjs';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function filterFor(ids) {
  return [{ field: 'ad.id', operator: 'IN', value: ids }];
}

function eachDay(since, until) {
  const out = [];
  const [y, m, d] = since.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(until + 'T00:00:00Z');
  while (cur <= end && out.length < 400) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function sumVideo(list) {
  return Array.isArray(list) ? list.reduce((s, a) => s + num(a.value), 0) : 0;
}

/**
 * @param {ReturnType<import('./meta-client.mjs').createMetaClient>} client
 * @param {{account:string, adIds:string[], since:string, until:string, video?:boolean}} q
 */
export async function fetchDetail(client, { account, adIds, since, until, video = false }) {
  const timeRange = { since, until };
  const chunks = [];
  for (let i = 0; i < adIds.length; i += 50) chunks.push(adIds.slice(i, i + 50));

  const byDay = new Map(eachDay(since, until).map((d) => [d, { date: d, spend: 0, purchaseValue: 0, impressions: 0 }]));
  const placements = new Map();
  let videoOut = null;

  for (const ids of chunks) {
    const base = { level: 'account', time_range: timeRange, filtering: filterFor(ids), limit: 500, use_unified_attribution_setting: true };
    const daily = await client.insights(account, { ...base, time_increment: 1, fields: 'spend,impressions,actions,action_values' });
    for (const r of daily.rows) {
      const day = byDay.get(r.date_start) || { date: r.date_start, spend: 0, purchaseValue: 0, impressions: 0 };
      day.spend += num(r.spend);
      day.impressions += num(r.impressions);
      day.purchaseValue += purchases(r.actions, r.action_values).value;
      byDay.set(r.date_start, day);
    }

    const pl = await client.insights(account, { ...base, breakdowns: 'publisher_platform,platform_position', fields: 'spend,impressions,actions,action_values' });
    for (const r of pl.rows) {
      const key = r.publisher_platform + '|' + r.platform_position;
      const cur = placements.get(key) || { platform: r.publisher_platform, position: r.platform_position, spend: 0, purchaseValue: 0, impressions: 0 };
      cur.spend += num(r.spend);
      cur.impressions += num(r.impressions);
      cur.purchaseValue += purchases(r.actions, r.action_values).value;
      placements.set(key, cur);
    }

    if (video && !videoOut) {
      // The retention curve is a percentage, so it comes from the first (largest) chunk only.
      const optional = ['video_play_curve_actions', 'video_avg_time_watched_actions'];
      const v = await client.insights(
        account,
        {
          ...base,
          fields: ['impressions', 'actions', 'video_thruplay_watched_actions', 'video_p25_watched_actions', 'video_p50_watched_actions', 'video_p75_watched_actions', 'video_p95_watched_actions', 'video_p100_watched_actions', ...optional].join(','),
        },
        { optionalFields: [...optional, 'video_p95_watched_actions'] },
      );
      const r = v.rows[0];
      if (r) {
        const curveEntry = Array.isArray(r.video_play_curve_actions) ? r.video_play_curve_actions.find((a) => Array.isArray(a.value)) : null;
        videoOut = {
          curve: curveEntry ? curveEntry.value.map(num) : null,
          impressions: num(r.impressions),
          video3s: actionValue(r.actions, 'video_view'),
          thruplays: sumVideo(r.video_thruplay_watched_actions),
          p25: sumVideo(r.video_p25_watched_actions),
          p50: sumVideo(r.video_p50_watched_actions),
          p75: sumVideo(r.video_p75_watched_actions),
          p95: sumVideo(r.video_p95_watched_actions),
          p100: sumVideo(r.video_p100_watched_actions),
          avgWatchSeconds: sumVideo(r.video_avg_time_watched_actions) || null,
        };
      }
    }
  }

  return {
    daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    placements: [...placements.values()].sort((a, b) => b.spend - a.spend),
    video: videoOut,
  };
}
