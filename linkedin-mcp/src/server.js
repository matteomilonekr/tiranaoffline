import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthError, TokenProvider } from './auth.js';
import { getConfig, LIMITS } from './config.js';
import { DraftStore } from './drafts.js';
import { LinkedInClient } from './linkedin.js';
import { inspectPost, POLL_DURATIONS, PublishHistory, publishPost, ValidationError, VISIBILITIES } from './publisher.js';
import { JsonStore } from './store.js';

export const SERVER_VERSION = '1.0.0';

export function createContext({ env = process.env, fetchImpl = fetch, sleep, publishOptions } = {}) {
  const config = getConfig(env);
  const store = new JsonStore(config.dataDir);
  const tokenProvider = new TokenProvider({ config, store, fetchImpl });
  const client = new LinkedInClient({
    tokenProvider,
    apiVersion: config.apiVersion,
    defaultAuthor: config.authorUrn,
    fetchImpl,
    sleep,
  });
  return {
    config,
    store,
    tokenProvider,
    client,
    drafts: new DraftStore(store),
    history: new PublishHistory(store),
    fetchImpl,
    publishOptions,
  };
}

export function publish(ctx, post) {
  return publishPost(post, {
    client: ctx.client,
    history: ctx.history,
    fetchImpl: ctx.fetchImpl,
    options: ctx.publishOptions,
  });
}

export async function publishDraft(ctx, id) {
  const draft = await ctx.drafts.claim(id);
  try {
    const result = await publish(ctx, draft.post);
    await ctx.drafts.remove(id);
    return { draftId: id, ...result };
  } catch (err) {
    await ctx.drafts.release(id).catch(() => {});
    throw err;
  }
}

const INSTRUCTIONS = `Tools to write, preview, schedule and publish LinkedIn content for the connected member (or a company page they admin).
Workflow: draft the text -> linkedin_preview_post (shows the "see more" cut, length and warnings) -> show the final text to the user -> publish only after the user explicitly confirms, or save it with linkedin_save_draft.
Publishing is public and immediate: never call linkedin_publish_post or linkedin_publish_draft without explicit confirmation.
LinkedIn has no markdown: **bold**, *italic*, # headings and * bullets are converted to Unicode automatically (markdown: true).
Put external links in firstComment rather than in the body to protect reach.`;

const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

const handler = (fn) => async (args) => {
  try {
    return text(await fn(args));
  } catch (err) {
    const prefix = err instanceof AuthError || err instanceof ValidationError ? '' : 'Error: ';
    return { isError: true, content: [{ type: 'text', text: `${prefix}${err.message}` }] };
  }
};

const postUrnSchema = z
  .string()
  .regex(
    /^urn:li:(share|ugcPost):\d+$/,
    'Expected urn:li:share:<id> or urn:li:ugcPost:<id>, as returned when publishing or by linkedin_list_published (the urn:li:activity in browser URLs is not accepted here)',
  )
  .describe('Post URN, e.g. urn:li:share:7212345678901234567 (returned when publishing, or from linkedin_list_published)');

const commentTargetSchema = z
  .string()
  .regex(/^urn:li:(share|ugcPost|activity):\d+$/, 'Expected urn:li:share:<id>, urn:li:ugcPost:<id> or urn:li:activity:<id>')
  .describe('Post URN; urn:li:activity:<id> from a linkedin.com/feed/update/... URL works too');

const source = (what) => z.string().min(1).describe(`${what}: absolute local file path or public http(s) URL`);

export const postSchema = z.object({
  text: z
    .string()
    .default('')
    .describe(
      `Post body, max ${LIMITS.commentary} characters. Line breaks are kept. #hashtags become clickable. ` +
        'Mention people/pages with @[Name](urn:li:person:ID) or @[Company](urn:li:organization:ID). ' +
        'Optional for media posts.',
    ),
  images: z
    .array(
      z.object({
        source: source('JPG, PNG or GIF image'),
        altText: z.string().optional().describe('Accessibility description (recommended under 120 characters)'),
      }),
    )
    .min(1)
    .max(LIMITS.maxImages)
    .optional()
    .describe('1 image = single image post, 2-20 images = multi-image post'),
  document: z
    .object({
      source: source('PDF, PPT, PPTX, DOC or DOCX (max 100 MB, 300 pages). A PDF becomes a swipeable carousel'),
      title: z.string().optional().describe('Title shown above the document; defaults to the file name'),
    })
    .optional()
    .describe('Document / PDF carousel post'),
  video: z
    .object({
      source: source('MP4 video, 3 seconds to 30 minutes, max 500 MB'),
      title: z.string().optional(),
    })
    .optional(),
  article: z
    .object({
      url: z.string().url(),
      title: z.string().optional(),
      description: z.string().optional(),
      thumbnail: z.string().optional().describe('Preview image path/URL; defaults to the page og:image'),
    })
    .optional()
    .describe('Link card. LinkedIn does not scrape links for API posts: missing fields are read from the page Open Graph tags'),
  poll: z
    .object({
      question: z.string().describe(`Max ${LIMITS.pollQuestion} characters`),
      options: z.array(z.string()).describe(`${LIMITS.minPollOptions}-${LIMITS.maxPollOptions} options, max ${LIMITS.pollOption} characters each`),
      duration: z.enum(POLL_DURATIONS).optional().describe('Defaults to THREE_DAYS'),
    })
    .optional(),
  reshareOf: postUrnSchema.optional().describe('Reshare this post (URN) with your text as commentary'),
  firstComment: z
    .string()
    .optional()
    .describe(`Comment added right after publishing, max ${LIMITS.comment} characters. Ideal for links`),
  visibility: z.enum(VISIBILITIES).optional().describe('Defaults to PUBLIC'),
  author: z
    .string()
    .optional()
    .describe('Defaults to the connected member. urn:li:organization:<id> posts as a company page (needs w_organization_social)'),
  markdown: z
    .boolean()
    .optional()
    .describe('Convert **bold**, *italic*, # headings, * bullets and [text](url) links (default true)'),
  disableReshare: z.boolean().optional(),
});

function summarizeInspection(inspected) {
  return {
    type: inspected.type,
    characters: inspected.analysis.characters,
    remaining: inspected.analysis.remaining,
    seeMorePreview: inspected.analysis.preview,
    hashtags: inspected.analysis.hashtags,
    warnings: inspected.analysis.warnings,
    errors: inspected.errors,
    readyToPublish: inspected.errors.length === 0,
  };
}

export function createLinkedInServer(ctx) {
  const server = new McpServer({ name: 'linkedin-mcp', version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'linkedin_get_profile',
    {
      title: 'LinkedIn account status',
      description: 'Shows which LinkedIn account is connected, the default author URN, token expiry and granted scopes.',
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    handler(async () => {
      let token;
      try {
        token = await ctx.tokenProvider.getToken();
      } catch (err) {
        if (err instanceof AuthError) return { connected: false, message: err.message };
        throw err;
      }
      let profile = null;
      let profileError = null;
      try {
        profile = await ctx.client.getUserInfo();
      } catch (err) {
        profileError = err.message;
      }
      const daysLeft = token.expiresAt ? Math.floor((token.expiresAt - Date.now()) / 86_400_000) : null;
      return {
        connected: true,
        name: profile?.name ?? token.profile?.name ?? null,
        email: profile?.email ?? null,
        personUrn: profile?.sub ? `urn:li:person:${profile.sub}` : token.personUrn ?? null,
        defaultAuthor: await ctx.client.resolveAuthor().catch(() => null),
        tokenSource: token.source,
        tokenExpiresAt: token.expiresAt ? new Date(token.expiresAt).toISOString() : 'unknown (LINKEDIN_ACCESS_TOKEN)',
        daysLeft,
        scopes: token.scope ?? 'unknown',
        apiVersion: ctx.config.apiVersion,
        ...(profileError ? { profileError } : {}),
      };
    }),
  );

  server.registerTool(
    'linkedin_preview_post',
    {
      title: 'Preview a LinkedIn post',
      description:
        'Checks a post without publishing: final text after formatting, character count, what shows before "…see more", hashtags, warnings and blocking errors. Use it before every publish.',
      inputSchema: postSchema.shape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    handler(async (post) => {
      const inspected = inspectPost(post);
      return { finalText: inspected.visible, ...summarizeInspection(inspected) };
    }),
  );

  server.registerTool(
    'linkedin_publish_post',
    {
      title: 'Publish a LinkedIn post',
      description:
        'Publishes immediately and publicly. Text post by default; set exactly one of images, document, video, article, poll or reshareOf for other formats. ' +
        'Only call after the user has seen the final text and explicitly confirmed.',
      inputSchema: postSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handler((post) => publish(ctx, post)),
  );

  server.registerTool(
    'linkedin_edit_post',
    {
      title: 'Edit a published post',
      description: 'Replaces the text of an already published post. Images, documents, videos and poll options cannot be changed.',
      inputSchema: {
        postUrn: postUrnSchema,
        text: z.string().min(1),
        markdown: z.boolean().optional().describe('Convert markdown as in linkedin_publish_post (default true)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    handler(async ({ postUrn, text: body, markdown }) => {
      const { commentary, visible, errors } = inspectPost({ text: body, markdown });
      if (errors.length) throw new ValidationError(errors);
      await ctx.client.updatePostCommentary(postUrn, commentary);
      return { updated: true, postUrn, finalText: visible };
    }),
  );

  server.registerTool(
    'linkedin_delete_post',
    {
      title: 'Delete a published post',
      description: 'Permanently deletes a post. Cannot be undone: confirm with the user first.',
      inputSchema: { postUrn: postUrnSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    handler(async ({ postUrn }) => {
      await ctx.client.deletePost(postUrn);
      await ctx.history.markDeleted(postUrn);
      return { deleted: true, postUrn };
    }),
  );

  server.registerTool(
    'linkedin_add_comment',
    {
      title: 'Comment on a post',
      description: 'Adds a comment (or a reply to a comment) on a post, e.g. to add the link in the first comment.',
      inputSchema: {
        postUrn: commentTargetSchema,
        text: z.string().min(1).describe(`Plain text, max ${LIMITS.comment} characters`),
        parentCommentUrn: z
          .string()
          .optional()
          .describe('Reply to this comment, e.g. urn:li:comment:(urn:li:activity:123,456)'),
        actor: z.string().optional().describe('Defaults to the connected member; urn:li:organization:<id> comments as a page'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handler(async ({ postUrn, text: body, parentCommentUrn, actor }) => {
      const comment = await ctx.client.createComment({
        postUrn,
        actor: await ctx.client.resolveAuthor(actor),
        text: body,
        parentCommentUrn,
      });
      return { commented: true, postUrn, ...comment };
    }),
  );

  server.registerTool(
    'linkedin_save_draft',
    {
      title: 'Save a draft',
      description:
        'Creates a draft (pass post) or updates an existing one (pass id plus the fields to change). ' +
        'scheduledFor marks when it should go out: `npm run publish-due` (e.g. from cron) publishes due drafts.',
      inputSchema: {
        id: z.string().optional().describe('Existing draft id to update'),
        post: postSchema.optional().describe('Same fields as linkedin_publish_post. Required when creating'),
        title: z.string().optional().describe('Internal name for the draft'),
        notes: z.string().optional(),
        scheduledFor: z
          .string()
          .nullable()
          .optional()
          .describe('ISO 8601 date-time with timezone, e.g. 2026-10-12T08:30:00+02:00. null removes the schedule'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    handler(async (args) => {
      const draft = await ctx.drafts.save(args);
      return { draft, check: summarizeInspection(inspectPost(draft.post)) };
    }),
  );

  server.registerTool(
    'linkedin_list_drafts',
    {
      title: 'List drafts',
      description: 'Lists saved drafts, scheduled ones first.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    handler(async () => {
      const drafts = await ctx.drafts.list();
      return drafts.map((draft) => {
        let type;
        try {
          type = inspectPost(draft.post).type;
        } catch {
          type = 'invalid';
        }
        return {
          id: draft.id,
          title: draft.title,
          type,
          scheduledFor: draft.scheduledFor,
          updatedAt: draft.updatedAt,
          excerpt: (draft.post.text || '').slice(0, 140),
        };
      });
    }),
  );

  server.registerTool(
    'linkedin_get_draft',
    {
      title: 'Read a draft',
      description: 'Returns a draft with its full content and a preview check.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    handler(async ({ id }) => {
      const draft = await ctx.drafts.get(id);
      const inspected = inspectPost(draft.post);
      return { draft, finalText: inspected.visible, check: summarizeInspection(inspected) };
    }),
  );

  server.registerTool(
    'linkedin_delete_draft',
    {
      title: 'Delete a draft',
      description: 'Deletes a saved draft (nothing is removed from LinkedIn).',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    handler(async ({ id }) => {
      await ctx.drafts.remove(id);
      return { deleted: true, id };
    }),
  );

  server.registerTool(
    'linkedin_publish_draft',
    {
      title: 'Publish a draft',
      description: 'Publishes a saved draft now and removes it from the drafts. Only after explicit user confirmation.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handler(({ id }) => publishDraft(ctx, id)),
  );

  server.registerTool(
    'linkedin_list_published',
    {
      title: 'Posts published from here',
      description:
        'Posts published through this server (local log with URN and URL). LinkedIn does not let standard apps read a member feed.',
      inputSchema: { limit: z.number().int().min(1).max(100).optional().describe('Defaults to 20') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    handler(({ limit }) => ctx.history.list(limit ?? 20)),
  );

  registerPrompts(server);
  return server;
}

const WRITING_RULES = `LinkedIn writing rules:
- Hook in the first line, under ~140 characters: it is all people see before "…see more".
- Short paragraphs (1-3 lines) separated by blank lines; one idea per post.
- Concrete over generic: numbers, examples, a personal angle.
- Close with a question or one clear call to action.
- 900-1500 characters is the sweet spot; hard limit ${LIMITS.commentary}.
- Max 3-5 relevant hashtags, at the end. No external links in the body: put them in firstComment.`;

function registerPrompts(server) {
  server.registerPrompt(
    'write_linkedin_post',
    {
      title: 'Write a LinkedIn post',
      description: 'Drafts a post on a topic, previews it and saves it as a draft.',
      argsSchema: {
        topic: z.string().describe('What the post is about'),
        audience: z.string().optional(),
        goal: z.string().optional().describe('e.g. awareness, leads, event sign-ups'),
        tone: z.string().optional(),
        language: z.string().optional(),
      },
    },
    ({ topic, audience, goal, tone, language }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Write a LinkedIn post about: ${topic}
Audience: ${audience || 'my LinkedIn network'}
Goal: ${goal || 'engagement and authority'}
Tone: ${tone || 'direct, concrete, human'}
Language: ${language || 'the language I am writing to you in'}

${WRITING_RULES}

Then call linkedin_preview_post, show me the final text and the "see more" preview, propose 2 alternative hooks, and save it with linkedin_save_draft. Do not publish until I explicitly say so.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'repurpose_for_linkedin',
    {
      title: 'Repurpose content for LinkedIn',
      description: 'Turns an article, transcript, notes or a URL into a LinkedIn post, carousel outline or poll.',
      argsSchema: {
        source: z.string().describe('The content itself or a URL to it'),
        format: z.string().optional().describe('text, carousel, poll or article (default text)'),
      },
    },
    ({ source: content, format }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Repurpose this into a LinkedIn ${format || 'text'} post:

${content}

${WRITING_RULES}

For a carousel: write the slide-by-slide outline (max ~10 slides, one idea each) plus the post text; the PDF goes in the document field once it exists.
For a poll: question max ${LIMITS.pollQuestion} characters, ${LIMITS.minPollOptions}-${LIMITS.maxPollOptions} options of max ${LIMITS.pollOption} characters.
Preview with linkedin_preview_post and save with linkedin_save_draft. Do not publish without my explicit confirmation.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'linkedin_content_plan',
    {
      title: 'LinkedIn content plan',
      description: 'Plans a series of posts and saves them as scheduled drafts.',
      argsSchema: {
        theme: z.string().describe('Overall theme, product or campaign'),
        postsPerWeek: z.string().optional(),
        weeks: z.string().optional(),
        startDate: z.string().optional().describe('YYYY-MM-DD'),
      },
    },
    ({ theme, postsPerWeek, weeks, startDate }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Plan ${weeks || '2'} weeks of LinkedIn content about: ${theme}
Posts per week: ${postsPerWeek || '3'}. Start date: ${startDate || 'next Monday'}.

Mix formats (text, carousel outline, poll, image) and angles (story, how-to, opinion, proof/case study, behind the scenes).
First show the calendar as a table (date, time, format, hook). After I approve it, write each post and save it with linkedin_save_draft, setting scheduledFor (weekday mornings 08:00-09:30 local time work well).

${WRITING_RULES}`,
          },
        },
      ],
    }),
  );
}
