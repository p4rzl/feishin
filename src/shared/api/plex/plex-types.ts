import { z } from 'zod';

const tag = z.object({ id: z.coerce.string().optional(), tag: z.string() });
const plexBoolean = z.union([z.boolean(), z.number()]).transform(Boolean).optional();

const basePlexMetadata = z.object({
    addedAt: z.number().optional(),
    childCount: z.number().optional(),
    composite: z.string().optional(),
    Country: z.array(tag).optional(),
    duration: z.number().optional(),
    Format: z.array(tag).optional(),
    Genre: z.array(tag).optional(),
    grandparentRatingKey: z.coerce.string().optional(),
    grandparentTitle: z.string().optional(),
    Guid: z.array(z.object({ id: z.string() })).optional(),
    index: z.number().optional(),
    key: z.string(),
    lastViewedAt: z.number().optional(),
    leafCount: z.number().optional(),
    librarySectionID: z.coerce.number().optional(),
    librarySectionTitle: z.string().optional(),
    Media: z
        .array(
            z.object({
                audioChannels: z.number().optional(),
                audioCodec: z.string().optional(),
                bitrate: z.number().optional(),
                container: z.string().optional(),
                Part: z
                    .array(
                        z.object({
                            file: z.string().optional(),
                            key: z.string(),
                            size: z.number().optional(),
                            Stream: z
                                .array(
                                    z.object({
                                        albumGain: z.coerce.number().optional(),
                                        albumPeak: z.coerce.number().optional(),
                                        bitDepth: z.number().optional(),
                                        codec: z.string().optional(),
                                        format: z.string().optional(),
                                        gain: z.coerce.number().optional(),
                                        key: z.string().optional(),
                                        peak: z.coerce.number().optional(),
                                        samplingRate: z.number().optional(),
                                        streamType: z.number(),
                                        timed: plexBoolean,
                                    }),
                                )
                                .optional(),
                        }),
                    )
                    .optional(),
            }),
        )
        .optional(),
    Mood: z.array(tag).optional(),
    originallyAvailableAt: z.string().optional(),
    originalTitle: z.string().optional(),
    parentIndex: z.number().optional(),
    parentRatingKey: z.coerce.string().optional(),
    parentThumb: z.string().optional(),
    parentTitle: z.string().optional(),
    playlistItemID: z.coerce.string().optional(),
    playlistType: z.string().optional(),
    ratingKey: z.coerce.string(),
    Similar: z.array(tag).optional(),
    smart: plexBoolean,
    studio: z.string().optional(),
    Style: z.array(tag).optional(),
    Subformat: z.array(tag).optional(),
    summary: z.string().optional(),
    thumb: z.string().optional(),
    thumbBlurHash: z.string().optional(),
    title: z.string(),
    titleSort: z.string().optional(),
    type: z.string().optional(),
    updatedAt: z.number().optional(),
    userRating: z.number().optional(),
    viewCount: z.number().optional(),
    year: z.number().optional(),
});

export const plexMetadata = basePlexMetadata.extend({
    PopularLeaves: z.object({ Metadata: z.array(basePlexMetadata).optional() }).optional(),
});

export const plexContainer = z.object({
    MediaContainer: z.object({
        Directory: z
            .array(
                z.object({
                    count: z.number().optional(),
                    key: z.coerce.string(),
                    refreshing: plexBoolean,
                    title: z.string(),
                    type: z.string().optional(),
                }),
            )
            .optional(),
        machineIdentifier: z.string().optional(),
        Metadata: z.array(plexMetadata).optional(),
        offset: z.number().optional(),
        size: z.number().optional(),
        totalSize: z.number().optional(),
        version: z.string().optional(),
    }),
});

export type PlexMetadata = z.infer<typeof plexMetadata>;

export const plexIdentity = z.object({
    MediaContainer: z.object({ machineIdentifier: z.string().min(1) }),
});

export const plexPin = z.object({
    authToken: z.string().min(1).nullish(),
    code: z.string().min(1),
    expiresIn: z.number().int().nonnegative(),
    id: z.number().int().positive(),
});

export const plexResources = z.array(
    z.object({
        accessToken: z.string().min(1).nullish(),
        clientIdentifier: z.string().min(1),
        connections: z
            .array(
                z.object({
                    local: z.boolean().default(false),
                    relay: z.boolean().default(false),
                    uri: z.string(),
                }),
            )
            .default([]),
        httpsRequired: z.boolean().default(false),
        name: z.string().optional(),
        owned: z.boolean().default(false),
        provides: z.string(),
    }),
);

export const plexAccount = z.object({
    id: z.union([z.number().int().positive(), z.string().min(1)]).transform(String),
    title: z.string().optional(),
    username: z.string().optional(),
});

export type PlexOAuthPin = { authUrl: string; code: string; expiresIn: number; id: number };

export const plexOAuthServer = z.object({
    connections: z.array(z.object({ local: z.boolean(), relay: z.boolean(), url: z.string() })),
    credential: z.string().min(1),
    httpsRequired: z.boolean(),
    id: z.string().min(1),
    name: z.string().min(1),
    owned: z.boolean(),
});

export type PlexAuthenticationResponse = {
    credential: string;
    isAdmin: boolean;
    name: string;
    plexServerId: string;
    url: string;
    userId: string;
    username: string;
};
export type PlexOAuthAccount = { servers: PlexOAuthServer[]; userId: string; username: string };

export type PlexOAuthServer = z.infer<typeof plexOAuthServer>;
