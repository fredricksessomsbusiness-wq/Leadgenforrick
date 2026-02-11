import type { Handler } from '@netlify/functions';
import { withErrorHandling, json } from './_http';
import { getJob, appendRunLog, countJobFirmResults, updateJobProgress } from '../../lib/db/jobs';
import { upsertCollectedLead } from '../../lib/db/collect';
import { buildGeoSegments } from '../../lib/geo';
import { assertPlacesConfigured, getPlaceDetails, searchPlaces, toLeadCandidate } from '../../lib/places';
import type { ParsedPlan } from '../../types/domain';

const BATCH_PLACE_LIMIT = 15;

const handler: Handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  assertPlacesConfigured();

  const { jobId } = JSON.parse(event.body ?? '{}');
  if (!jobId) return json(400, { error: 'jobId is required' });

  const job = await getJob(jobId);
  const plan = job.parsed_plan_json as ParsedPlan;
  const segments = buildGeoSegments(plan);

  await updateJobProgress(jobId, {
    status: 'running',
    started_at: job.started_at ?? new Date().toISOString()
  });

  let progressCount = await countJobFirmResults(jobId);
  if (progressCount >= job.target_firm_count) {
    await updateJobProgress(jobId, { status: 'completed', progress_count: progressCount, finished_at: new Date().toISOString() });
    return json(200, { done: true, progressCount });
  }

  let segmentOffset = Number(job.current_segment_offset ?? 0);
  let keywordOffset = Number(job.current_keyword_offset ?? 0);

  if (segmentOffset >= segments.length) {
    await updateJobProgress(jobId, { status: 'completed', progress_count: progressCount, finished_at: new Date().toISOString() });
    return json(200, { done: true, progressCount });
  }

  const keyword = plan.keywords[keywordOffset];
  const segment = segments[segmentOffset];
  const query = `${keyword} in ${segment.locationText}`;

  const raw = await searchPlaces(query);
  const candidates = raw.slice(0, BATCH_PLACE_LIMIT);
  let newCount = 0;
  let duplicateCount = 0;

  for (const item of candidates) {
    if (progressCount >= job.target_firm_count) break;
    const detail = await getPlaceDetails(item.place_id);
    if (!detail) continue;

    const candidate = toLeadCandidate(detail, query, segment.label);
    const result = await upsertCollectedLead(jobId, candidate, Boolean(job.allow_reinclude));

    if (result.inserted) {
      newCount += 1;
      progressCount += 1;
    } else {
      duplicateCount += 1;
    }
  }

  await appendRunLog(jobId, {
    event: 'collect_batch',
    query,
    segment: segment.label,
    found: candidates.length,
    new: newCount,
    duplicate: duplicateCount,
    progress_count: progressCount
  });

  keywordOffset += 1;
  if (keywordOffset >= plan.keywords.length) {
    keywordOffset = 0;
    segmentOffset += 1;
  }

  const done = progressCount >= job.target_firm_count || segmentOffset >= segments.length;

  await updateJobProgress(jobId, {
    progress_count: progressCount,
    current_keyword_offset: keywordOffset,
    current_segment_offset: segmentOffset,
    status: done ? 'completed' : 'running',
    finished_at: done ? new Date().toISOString() : null
  });

  return json(200, {
    done,
    progressCount,
    target: job.target_firm_count,
    next: done ? null : 'run-collect-batch-background'
  });
});

export { handler };
