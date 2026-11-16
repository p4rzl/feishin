import {
    plexHeaders,
    plexMutation,
    plexRequest,
    plexTextRequest,
    plexUrl,
} from '/@/renderer/api/plex/plex-api';
import { authenticatePlex } from '/@/renderer/api/plex/plex-auth';
import { useRadioStore } from '/@/renderer/features/radio/store/radio-store';
import { getServerUrl } from '/@/renderer/utils/normalize-server-url';
import { plexNormalize } from '/@/shared/api/plex/plex-normalize';
import { PlexMetadata } from '/@/shared/api/plex/plex-types';
import { sortSongList } from '/@/shared/api/utils';
import {
    AlbumArtistListArgs,
    AlbumArtistListSort,
    AlbumListQuery,
    AlbumListSort,
    ArtistListArgs,
    ArtistListQuery,
    Genre,
    GenreListSort,
    InternalControllerEndpoint,
    LibraryItem,
    Played,
    PlaylistListSort,
    RelatedArtist,
    ReplaceApiClientProps,
    ServerInfoArgs,
    ServerListItemWithCredential,
    ServerType,
    Song,
    SongListQuery,
    SongListSort,
    SortOrder,
    SynchronizedLyrics,
} from '/@/shared/types/domain-types';
import { ServerFeature } from '/@/shared/types/features-types';

type ClientProps = ReplaceApiClientProps<ServerInfoArgs>['apiClientProps'];
type ListQuery = Partial<
    Omit<AlbumListQuery, 'sortBy'> & Omit<ArtistListQuery, 'sortBy'> & Omit<SongListQuery, 'sortBy'>
> & { played?: Played; sortBy?: string };

const PLEX_SORTS: Record<string, string> = {
    album: 'album.titleSort',
    albumArtist: 'artist.titleSort',
    artist: 'artist.titleSort',
    duration: 'duration',
    name: 'titleSort',
    playCount: 'viewCount',
    random: 'random',
    rating: 'userRating',
    recentlyAdded: 'addedAt',
    recentlyPlayed: 'lastViewedAt',
    releaseDate: 'originallyAvailableAt',
    sortName: 'titleSort',
    year: 'year',
};

const requiredServer = (props: ClientProps): ServerListItemWithCredential => {
    if (!props.server) throw new Error('Plex server is required');
    return props.server;
};

const sections = async (props: ClientProps) =>
    (await plexRequest(props, '/library/sections')).Directory?.filter(
        (item) => item.type === 'artist',
    ) ?? [];

const selectedFolders = (musicFolderId?: string | string[]): string[] =>
    (Array.isArray(musicFolderId) ? musicFolderId : musicFolderId ? [musicFolderId] : []).filter(
        Boolean,
    );

const metadata = async (props: ClientProps, id: string, params: Record<string, unknown> = {}) => {
    const result = await plexRequest(props, `/library/metadata/${encodeURIComponent(id)}`, params);
    const item = result.Metadata?.[0];
    if (!item) throw new Error('Plex item not found');
    return item;
};

// Plex caps some responses even without a container size. Walk pages when the caller needs all items.
const items = async (props: ClientProps, path: string, params: Record<string, unknown> = {}) => {
    const result: PlexMetadata[] = [];
    let start = 0;
    while (true) {
        const page = await plexRequest(props, path, {
            ...params,
            'X-Plex-Container-Size': 500,
            'X-Plex-Container-Start': start,
        });
        const entries = page.Metadata ?? [];
        result.push(...entries);
        start += entries.length;
        if (!entries.length || start >= (page.totalSize ?? page.size ?? start)) break;
    }
    return result;
};

const genreDirectory = async (props: ClientProps, musicFolderId?: string | string[]) => {
    const folders = await sections(props);
    const selected = new Set(selectedFolders(musicFolderId));
    const results = await Promise.all(
        folders
            .filter((folder) => !selected.size || selected.has(folder.key))
            .map((folder) =>
                plexRequest(props, `/library/sections/${encodeURIComponent(folder.key)}/genre`, {
                    type: 9,
                }),
            ),
    );
    const unique = new Map<string, { count: null | number; key: string; title: string }>();
    for (const entry of results.flatMap((result) => result.Directory ?? [])) {
        const existing = unique.get(entry.key);
        const count =
            entry.count !== undefined
                ? (existing?.count ?? 0) + entry.count
                : (existing?.count ?? null);
        unique.set(entry.key, { count, key: entry.key, title: entry.title });
    }
    return [...unique.values()];
};

const resolveGenreIds = async (
    props: ClientProps,
    genreIds: string[],
    musicFolderId?: string | string[],
): Promise<string[]> => {
    if (genreIds.every((id) => /^\d+$/.test(id))) return genreIds;
    const directory = await genreDirectory(props, musicFolderId).catch(() => []);
    const byName = new Map(
        directory.map((entry) => [entry.title.toLowerCase(), entry.key] as const),
    );
    return [
        ...new Set(genreIds.map((id) => byName.get(id.trim().toLowerCase()) ?? id).filter(Boolean)),
    ];
};

const list = async (props: ClientProps, type: 8 | 9 | 10, query: ListQuery) => {
    const folders = selectedFolders(query.musicFolderId);
    const field = PLEX_SORTS[query.sortBy ?? 'name'] ?? 'titleSort';
    const params: Record<string, unknown> = {
        sort:
            field === 'random'
                ? 'random'
                : `${field}:${query.sortOrder === SortOrder.DESC ? 'desc' : 'asc'}`,
        type,
    };
    if (query.searchTerm) params.title = query.searchTerm;
    if (query.artistIds?.length || query.albumArtistIds?.length) {
        params['artist.id'] = (query.artistIds ?? query.albumArtistIds)?.join(',');
    }
    if (query.albumIds?.length) params['album.id'] = query.albumIds.join(',');
    if (query.genreIds?.length) {
        params.genre = (await resolveGenreIds(props, query.genreIds, query.musicFolderId)).join(
            ',',
        );
    }
    if (query.favorite === true) params.userRating = 10;
    else if (query.favorite === false) params['userRating!'] = 10;
    if (query.hasRating === true) params['userRating>>'] = 0;
    else if (query.hasRating === false) params.userRating = -1;
    if (query.minYear) params['year>>'] = query.minYear - 1;
    if (query.maxYear) params['year<<'] = query.maxYear + 1;
    if (query.played === Played.Never) params.viewCount = 0;
    if (query.played === Played.Played) params['viewCount>>'] = 0;
    const startIndex = query.startIndex ?? 0;
    if (folders.length > 1) {
        const all = (
            await Promise.all(
                folders.map((folder) =>
                    items(props, `/library/sections/${encodeURIComponent(folder)}/all`, params),
                ),
            )
        ).flat();
        const end =
            query.limit === undefined || query.limit < 0 ? undefined : startIndex + query.limit;
        return {
            entries: all.slice(startIndex, end),
            startIndex,
            totalRecordCount: all.length,
        };
    }
    const path = folders[0]
        ? `/library/sections/${encodeURIComponent(folders[0])}/all`
        : '/library/all';
    if (query.limit === undefined || query.limit < 0) {
        const entries = await items(props, path, params);
        return { entries: entries.slice(startIndex), startIndex, totalRecordCount: entries.length };
    }
    const response = await plexRequest(props, path, {
        ...params,
        'X-Plex-Container-Size': query.limit,
        'X-Plex-Container-Start': startIndex,
    });
    return {
        entries: response.Metadata ?? [],
        startIndex,
        totalRecordCount: response.totalSize ?? response.size ?? 0,
    };
};

const songListWithGenreFallback = async (props: ClientProps, query: ListQuery) => {
    const direct = await list(props, 10, query);
    if (
        direct.entries.length ||
        direct.totalRecordCount > 0 ||
        !query.genreIds?.length ||
        query.albumIds?.length
    ) {
        return direct;
    }
    // Plex often stores Genre tags on albums (type 9) rather than tracks (type 10).
    const albums = await list(props, 9, {
        albumArtistIds: query.albumArtistIds,
        artistIds: query.artistIds,
        genreIds: query.genreIds,
        limit: -1,
        maxYear: query.maxYear,
        minYear: query.minYear,
        musicFolderId: query.musicFolderId,
        startIndex: 0,
    });
    if (!albums.entries.length) return direct;
    const albumGenres = new Map(albums.entries.map((album) => [album.ratingKey, album.Genre]));
    const byAlbums = await list(props, 10, {
        ...query,
        albumIds: albums.entries.map((album) => album.ratingKey),
        genreIds: undefined,
    });
    return {
        ...byAlbums,
        entries: byAlbums.entries.map((track) =>
            track.Genre?.length
                ? track
                : { ...track, Genre: albumGenres.get(track.parentRatingKey ?? '') },
        ),
    };
};

const songList: InternalControllerEndpoint['getSongList'] = async ({ apiClientProps, query }) => {
    const { entries, ...page } = await songListWithGenreFallback(apiClientProps, query);
    const songs = entries.map((item) => plexNormalize.song(item, requiredServer(apiClientProps)));
    const sortAlbumTracks =
        (query.limit === undefined || query.limit < 0) &&
        (query.sortBy === SongListSort.ALBUM || query.sortBy === SongListSort.ALBUM_ARTIST);
    return {
        ...page,
        items: sortAlbumTracks ? sortSongList(songs, query.sortBy, query.sortOrder) : songs,
    };
};

const albumList: InternalControllerEndpoint['getAlbumList'] = async ({ apiClientProps, query }) => {
    const { entries, ...page } = await list(apiClientProps, 9, query);
    return {
        ...page,
        items: entries.map((item) => plexNormalize.album(item, requiredServer(apiClientProps))),
    };
};

const artistList = async ({
    apiClientProps,
    query,
}: ReplaceApiClientProps<AlbumArtistListArgs> | ReplaceApiClientProps<ArtistListArgs>) => {
    const { entries, ...page } = await list(apiClientProps, 8, query);
    return {
        ...page,
        items: entries.map((item) => plexNormalize.artist(item, requiredServer(apiClientProps))),
    };
};

const tryTracks = (props: ClientProps, path: string, params: Record<string, unknown> = {}) =>
    plexRequest(props, path, params)
        .then((res) => (res.Metadata ?? []).filter((item) => item.type === 'track'))
        .catch(() => []);

const parseLrcLyrics = (raw: string): string | SynchronizedLyrics => {
    const matches = [...raw.matchAll(/\[(\d{2,}):(\d{2})(?:\.(\d{2,3}))?\]([^\r\n]*)/g)];
    if (!matches.length) return raw.trim();
    return matches.map(([, min, sec, ms, text]) => ({
        startMs:
            (Number(min) * 60 + Number(sec)) * 1000 +
            (ms ? (ms.length === 3 ? Number(ms) : Number(ms) * 10) : 0),
        text: text.trim(),
    }));
};

const playlistItems = (props: ClientProps, id: string) =>
    items(props, `/playlists/${encodeURIComponent(id)}/items`);

const playlistDetail = async (props: ClientProps, id: string) => {
    const result = await plexRequest(props, `/playlists/${encodeURIComponent(id)}`);
    const playlist = result.Metadata?.[0];
    if (!playlist) throw new Error('Plex playlist not found');
    return playlist;
};

const assertAudioPlaylist = async (props: ClientProps, id: string) => {
    const playlist = await playlistDetail(props, id);
    if (playlist.type !== 'playlist' || playlist.playlistType !== 'audio') {
        throw new Error('Only Plex music playlists can be edited');
    }
    return playlist;
};

const assertEditablePlaylist = async (props: ClientProps, id: string) => {
    const playlist = await assertAudioPlaylist(props, id);
    if (playlist.smart) {
        throw new Error('Only regular Plex music playlists can be edited');
    }
};

const playlistUri = async (props: ClientProps, ids: string[]) => {
    const server = await plexRequest(props, '/');
    if (!server.machineIdentifier) throw new Error('Plex server identifier is missing');
    return `server://${server.machineIdentifier}/com.plexapp.plugins.library/library/metadata/${ids.map(encodeURIComponent).join(',')}`;
};

const addToPlaylist: InternalControllerEndpoint['addToPlaylist'] = async ({
    apiClientProps,
    body,
    query,
}) => {
    await assertEditablePlaylist(apiClientProps, query.id);
    // Keep URI query strings below common reverse-proxy limits while preserving order and duplicates.
    for (let start = 0; start < body.songId.length; start += 50) {
        await plexMutation(apiClientProps, `/playlists/${encodeURIComponent(query.id)}/items`, {
            uri: await playlistUri(apiClientProps, body.songId.slice(start, start + 50)),
        });
    }
    return null;
};

const replacePlaylist: InternalControllerEndpoint['replacePlaylist'] = async ({
    apiClientProps,
    body,
    query,
}) => {
    await assertEditablePlaylist(apiClientProps, query.id);
    // ponytail: validate serially before replacement; batch metadata if large replacements become slow.
    for (const id of body.songId) {
        if ((await metadata(apiClientProps, id)).type !== 'track')
            throw new Error('Invalid Plex track');
    }
    const previous = await playlistItems(apiClientProps, query.id);
    if (previous.some((item) => !item.playlistItemID))
        throw new Error('Plex playlist entry ID is missing');
    // Plex has no atomic replace. Append successfully before removing old entries to avoid data loss.
    await addToPlaylist({ apiClientProps, body, query });
    for (const item of previous) {
        await plexMutation(
            apiClientProps,
            `/playlists/${encodeURIComponent(query.id)}/items/${encodeURIComponent(item.playlistItemID!)}`,
            {},
            'DELETE',
        );
    }
    return null;
};

const fileUrl = async (props: ClientProps, id: string, download = false) => {
    const item = await metadata(props, id);
    const part = item.Media?.[0]?.Part?.[0];
    const base = getServerUrl(props.server, props.forceRemoteUrl);
    if (!part?.key || !base) throw new Error('Plex track has no playable media');
    const url = plexUrl(base, part.key);
    // Media players cannot attach headers; use the same client identity as timeline reports.
    for (const [key, value] of Object.entries(plexHeaders(requiredServer(props).credential))) {
        if (key.startsWith('X-Plex-')) url.searchParams.set(key, value);
    }
    if (download) url.searchParams.set('download', '1');
    return url.toString();
};

const unsupported = async (): Promise<never> => {
    throw new Error('This feature is not supported by Plex');
};

export const PlexController: InternalControllerEndpoint = {
    addToPlaylist,
    authenticate: authenticatePlex,
    createFavorite: async ({ apiClientProps, query }) => {
        for (const id of query.id)
            await plexMutation(apiClientProps, '/:/rate', {
                identifier: 'com.plexapp.plugins.library',
                key: id,
                rating: 10,
            });
        return null;
    },
    createInternetRadioStation: async ({ apiClientProps, body }) => {
        const serverId = apiClientProps.server?.id;
        if (!serverId) throw new Error('Plex server is required');
        useRadioStore.getState().actions.createStation(serverId, {
            homepageUrl: body.homepageUrl || null,
            name: body.name,
            streamUrl: body.streamUrl,
        });
        return null;
    },
    createPlaylist: async ({ apiClientProps, body }) => {
        const result = await plexRequest(
            apiClientProps,
            '/playlists',
            {
                smart: 0,
                title: body.name,
                type: 'audio',
                uri: '',
            },
            'POST',
        );
        const id = result.Metadata?.[0]?.ratingKey;
        if (!id) throw new Error('Plex did not create the playlist');
        if (body.comment?.trim()) {
            await plexMutation(apiClientProps, `/playlists/${encodeURIComponent(id)}`, {
                summary: body.comment,
            });
        }
        return { id };
    },
    deleteFavorite: async ({ apiClientProps, query }) => {
        for (const id of query.id)
            await plexMutation(apiClientProps, '/:/rate', {
                identifier: 'com.plexapp.plugins.library',
                key: id,
                rating: 0,
            });
        return null;
    },
    deleteInternetRadioStation: async ({ apiClientProps, query }) => {
        const serverId = apiClientProps.server?.id;
        if (!serverId) throw new Error('Plex server is required');
        useRadioStore.getState().actions.deleteStation(serverId, query.id);
        return null;
    },
    deletePlaylist: async ({ apiClientProps, query }) => {
        await plexMutation(
            apiClientProps,
            `/playlists/${encodeURIComponent(query.id)}`,
            {},
            'DELETE',
        );
        return null;
    },
    getAlbumArtistDetail: async ({ apiClientProps, query }) =>
        plexNormalize.artist(
            await metadata(apiClientProps, query.id),
            requiredServer(apiClientProps),
        ),
    getAlbumArtistInfo: async ({ apiClientProps, query }) => {
        const item = await metadata(apiClientProps, query.id);
        const limit = query.limit ?? 10;
        const related = new Map<string, RelatedArtist>();
        const addRelated = (entry: PlexMetadata) => {
            if (entry.ratingKey === query.id || related.has(entry.ratingKey)) return;
            related.set(entry.ratingKey, {
                id: entry.ratingKey,
                imageId: entry.thumb ?? null,
                imageUrl: null,
                name: entry.title,
                userFavorite: entry.userRating === 10,
                userRating: entry.userRating === undefined ? null : entry.userRating / 2,
            });
        };
        const similar = await plexRequest(
            apiClientProps,
            `/library/metadata/${encodeURIComponent(query.id)}/similar`,
            { limit },
        ).catch(() => null);
        for (const entry of similar?.Metadata ?? []) {
            if (!entry.type || entry.type === 'artist') addRelated(entry);
        }
        if (related.size < limit && item.Similar?.length) {
            const names = new Set(item.Similar.map((entry) => entry.tag.trim().toLowerCase()));
            const candidates = await list(apiClientProps, 8, { limit: -1, startIndex: 0 });
            for (const entry of candidates.entries) {
                if (names.has(entry.title.trim().toLowerCase())) addRelated(entry);
            }
        }
        if (!related.size && item.Genre?.length) {
            const byGenre = await list(apiClientProps, 8, {
                genreIds: [item.Genre[0].id ?? item.Genre[0].tag],
                limit: limit + 1,
                sortBy: 'random',
                startIndex: 0,
            });
            for (const entry of byGenre.entries) addRelated(entry);
        }
        return {
            biography: item.summary ?? null,
            similarArtists: [...related.values()].slice(0, limit),
        };
    },
    getAlbumArtistList: artistList,
    getAlbumArtistListCount: async ({ apiClientProps, query }) =>
        (await list(apiClientProps, 8, { ...query, limit: 0 })).totalRecordCount,
    getAlbumDetail: async ({ apiClientProps, query }) => {
        const [item, tracks] = await Promise.all([
            metadata(apiClientProps, query.id),
            items(apiClientProps, `/library/metadata/${encodeURIComponent(query.id)}/children`),
        ]);
        const server = requiredServer(apiClientProps);
        const songs = tracks
            .filter((track) => track.type === 'track')
            .map((track) =>
                plexNormalize.song(
                    track.Genre?.length ? track : { ...track, Genre: item.Genre },
                    server,
                ),
            );
        songs.sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber);
        return {
            ...plexNormalize.album(item, server),
            duration: songs.reduce((sum, song) => sum + song.duration, 0),
            songCount: songs.length,
            songs,
        };
    },
    getAlbumInfo: async ({ apiClientProps, query }) => ({
        imageUrl: null,
        notes: (await metadata(apiClientProps, query.id)).summary ?? null,
    }),
    getAlbumList: albumList,
    getAlbumListCount: async ({ apiClientProps, query }) =>
        (await list(apiClientProps, 9, { ...query, limit: 0 })).totalRecordCount,
    getAlbumRadio: async ({ apiClientProps, query }) => {
        const limit = query.count ?? 20;
        const server = requiredServer(apiClientProps);
        const results = new Map<string, Song>();
        const addSong = (song: Song) => {
            if (!results.has(song.id) && results.size < limit) results.set(song.id, song);
        };
        for (const entry of await tryTracks(
            apiClientProps,
            `/library/metadata/${encodeURIComponent(query.albumId)}/nearest`,
            { limit },
        )) {
            addSong(plexNormalize.song(entry, server));
        }
        if (results.size < limit) {
            const album = await metadata(apiClientProps, query.albumId).catch(() => null);
            const genreTag = album?.Genre?.[0];
            if (genreTag) {
                const byGenre = await songList({
                    apiClientProps,
                    query: {
                        genreIds: [genreTag.id ?? genreTag.tag],
                        limit,
                        musicFolderId: server.musicFolderId,
                        sortBy: SongListSort.RANDOM,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                });
                for (const song of byGenre.items) addSong(song);
            }
            if (results.size < limit && album?.parentRatingKey) {
                const byArtist = await songList({
                    apiClientProps,
                    query: {
                        artistIds: [album.parentRatingKey],
                        limit,
                        musicFolderId: server.musicFolderId,
                        sortBy: SongListSort.RANDOM,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                });
                for (const song of byArtist.items) addSong(song);
            }
        }
        return [...results.values()];
    },
    getArtistList: artistList,
    getArtistListCount: async ({ apiClientProps, query }) =>
        (await list(apiClientProps, 8, { ...query, limit: 0 })).totalRecordCount,
    getArtistRadio: async ({ apiClientProps, query }) => {
        const limit = query.count ?? 20;
        const server = requiredServer(apiClientProps);
        const results = new Map<string, Song>();
        const addSong = (song: Song) => {
            if (!results.has(song.id) && results.size < limit) results.set(song.id, song);
        };
        for (const entry of await tryTracks(
            apiClientProps,
            `/library/metadata/${encodeURIComponent(query.artistId)}/nearest`,
            { limit },
        )) {
            addSong(plexNormalize.song(entry, server));
        }
        if (results.size < limit) {
            const byArtist = await songList({
                apiClientProps,
                query: {
                    artistIds: [query.artistId],
                    limit,
                    musicFolderId: server.musicFolderId,
                    sortBy: SongListSort.RANDOM,
                    sortOrder: SortOrder.ASC,
                    startIndex: 0,
                },
            });
            for (const song of byArtist.items) addSong(song);
        }
        if (results.size < limit) {
            const artist = await metadata(apiClientProps, query.artistId).catch(() => null);
            const genreTag = artist?.Genre?.[0];
            if (genreTag) {
                const byGenre = await songList({
                    apiClientProps,
                    query: {
                        genreIds: [genreTag.id ?? genreTag.tag],
                        limit,
                        musicFolderId: server.musicFolderId,
                        sortBy: SongListSort.RANDOM,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                });
                for (const song of byGenre.items) addSong(song);
            }
        }
        return [...results.values()];
    },
    getDownloadUrl: ({ apiClientProps, query }) => fileUrl(apiClientProps, query.id, true),
    getFavoriteSongs: ({ apiClientProps, query }) =>
        songList({
            apiClientProps,
            query: {
                artistIds: [query.artistId],
                favorite: query.type !== 'rating',
                hasRating: query.type === 'rating',
                limit: query.limit,
                sortBy: query.type === 'rating' ? SongListSort.RATING : SongListSort.PLAY_COUNT,
                sortOrder: SortOrder.DESC,
                startIndex: 0,
            },
        }),
    getFolder: unsupported,
    getGenreList: async ({ apiClientProps, query }) => {
        const server = requiredServer(apiClientProps);
        const directory = await genreDirectory(apiClientProps, query.musicFolderId);
        let genres: Genre[] = directory.map((entry) => ({
            _itemType: LibraryItem.GENRE,
            _serverId: server.id,
            _serverType: ServerType.PLEX,
            albumCount: entry.count,
            id: entry.key,
            imageId: null,
            imageUrl: null,
            name: entry.title,
            songCount: null,
        }));
        genres = genres.filter(
            (entry) =>
                !query.searchTerm ||
                entry.name.toLowerCase().includes(query.searchTerm.toLowerCase()),
        );
        genres.sort((a, b) => {
            const comparison =
                query.sortBy === GenreListSort.ALBUM_COUNT
                    ? (a.albumCount ?? 0) - (b.albumCount ?? 0)
                    : query.sortBy === GenreListSort.SONG_COUNT
                      ? (a.songCount ?? 0) - (b.songCount ?? 0)
                      : a.name.localeCompare(b.name);
            return comparison * (query.sortOrder === SortOrder.DESC ? -1 : 1);
        });
        return {
            items: genres.slice(
                query.startIndex,
                query.limit === undefined || query.limit < 0
                    ? undefined
                    : query.startIndex + query.limit,
            ),
            startIndex: query.startIndex,
            totalRecordCount: genres.length,
        };
    },
    getImageRequest: ({ apiClientProps, baseUrl, query }) => {
        const server = requiredServer(apiClientProps);
        const base = baseUrl ?? getServerUrl(server, apiClientProps.forceRemoteUrl);
        if (!base) return null;
        const path = query.id.startsWith('/')
            ? query.id
            : `/library/metadata/${encodeURIComponent(query.id)}/thumb`;
        return {
            cacheKey: ['plex', server.id, baseUrl ?? '', path].join(':'),
            headers: plexHeaders(server.credential),
            url: plexUrl(base, path).toString(),
        };
    },
    getImageUrl: (args) => {
        const request = PlexController.getImageRequest(args);
        if (!request) return null;
        const url = new URL(request.url);
        url.searchParams.set('X-Plex-Token', requiredServer(args.apiClientProps).credential);
        return url.toString();
    },
    getInternetRadioStations: async ({ apiClientProps }) => {
        const serverId = apiClientProps.server?.id;
        return serverId ? useRadioStore.getState().actions.getStations(serverId) : [];
    },
    getLyrics: async ({ apiClientProps, query }) => {
        const item = await metadata(apiClientProps, query.songId);
        const streams = (item.Media ?? [])
            .flatMap((media) => media.Part ?? [])
            .flatMap((part) => part.Stream ?? [])
            .filter(
                (stream) => stream.streamType === 4 && stream.key?.startsWith('/library/streams/'),
            );
        const selected =
            streams.find(
                (stream) => stream.timed || stream.codec === 'lrc' || stream.format === 'lrc',
            ) ?? streams[0];
        if (!selected?.key) return '';
        const text = await plexTextRequest(apiClientProps, selected.key);
        return text.trim() ? parseLrcLyrics(text) : '';
    },
    getMusicFolderList: async ({ apiClientProps }) => {
        const folders = await sections(apiClientProps);
        return {
            items: folders.map((entry) => ({ id: entry.key, name: entry.title })),
            startIndex: 0,
            totalRecordCount: folders.length,
        };
    },
    getPlaylistDetail: async ({ apiClientProps, query }) =>
        plexNormalize.playlist(
            await playlistDetail(apiClientProps, query.id),
            requiredServer(apiClientProps),
        ),
    getPlaylistList: async ({ apiClientProps, query }) => {
        const playlists = (
            await items(apiClientProps, '/playlists', { playlistType: 'audio' })
        ).filter(
            (entry) =>
                (!query.excludeSmartPlaylists || !entry.smart) &&
                (!query.searchTerm ||
                    entry.title.toLowerCase().includes(query.searchTerm.toLowerCase())),
        );
        playlists.sort((a, b) => {
            const fields: Partial<
                Record<PlaylistListSort, 'duration' | 'leafCount' | 'updatedAt'>
            > = {
                [PlaylistListSort.DURATION]: 'duration',
                [PlaylistListSort.SONG_COUNT]: 'leafCount',
                [PlaylistListSort.UPDATED_AT]: 'updatedAt',
            };
            const field = fields[query.sortBy];
            const comparison = field
                ? Number(a[field] ?? 0) - Number(b[field] ?? 0)
                : a.title.localeCompare(b.title);
            return comparison * (query.sortOrder === SortOrder.DESC ? -1 : 1);
        });
        return {
            items: playlists
                .slice(
                    query.startIndex,
                    query.limit === undefined || query.limit < 0
                        ? undefined
                        : query.startIndex + query.limit,
                )
                .map((entry) => plexNormalize.playlist(entry, requiredServer(apiClientProps))),
            startIndex: query.startIndex,
            totalRecordCount: playlists.length,
        };
    },
    getPlaylistListCount: async ({ apiClientProps, query }) =>
        (
            await PlexController.getPlaylistList({
                apiClientProps,
                query: { ...query, limit: 0, startIndex: 0 },
            })
        ).totalRecordCount ?? 0,
    getPlaylistSongIds: async ({ apiClientProps, query }) => {
        const entries = await playlistItems(apiClientProps, query.id);
        return {
            items: entries.map((entry) => entry.ratingKey),
            startIndex: 0,
            totalRecordCount: entries.length,
        };
    },
    getPlaylistSongList: async ({ apiClientProps, query }) => {
        const entries = await playlistItems(apiClientProps, query.id);
        return {
            items: entries.map((entry) =>
                plexNormalize.song(entry, requiredServer(apiClientProps)),
            ),
            startIndex: 0,
            totalRecordCount: entries.length,
        };
    },
    getPlayQueue: unsupported,
    getRandomSongList: async ({ apiClientProps, query }) => {
        return songList({
            apiClientProps,
            query: {
                ...query,
                genreIds: query.genre ? [query.genre.id] : undefined,
                sortBy: SongListSort.RANDOM,
                sortOrder: SortOrder.ASC,
                startIndex: 0,
            },
        });
    },
    getRoles: async () => [],
    getScanStatus: async ({ apiClientProps }) => ({
        count: 0,
        folderCount: 0,
        scanning: (await sections(apiClientProps)).some((entry) => entry.refreshing),
    }),
    getServerInfo: async ({ apiClientProps }) => {
        const result = await plexRequest(apiClientProps, '/');
        return {
            features: {
                [ServerFeature.LYRICS_SINGLE_STRUCTURED]: [1],
                [ServerFeature.MUSIC_FOLDER_MULTISELECT]: [1],
                [ServerFeature.REPORT_PLAYBACK]: [1],
                [ServerFeature.SIMILAR_SONGS_MUSIC_FOLDER]: [1],
                [ServerFeature.TOP_SONGS_BY_ARTIST_ID]: [1],
            },
            id: requiredServer(apiClientProps).id,
            version: result.version ?? '',
        };
    },
    getSimilarSongs: async ({ apiClientProps, query }) => {
        const limit = query.count ?? 50;
        const server = requiredServer(apiClientProps);
        const results = new Map<string, Song>();
        const addSong = (song: Song) => {
            if (song.id !== query.songId && !results.has(song.id) && results.size < limit) {
                results.set(song.id, song);
            }
        };
        const sonic = await tryTracks(
            apiClientProps,
            `/library/metadata/${encodeURIComponent(query.songId)}/nearest`,
            { limit },
        );
        const direct = sonic.length
            ? sonic
            : await tryTracks(
                  apiClientProps,
                  `/library/metadata/${encodeURIComponent(query.songId)}/similar`,
                  { limit },
              );
        for (const entry of direct) addSong(plexNormalize.song(entry, server));
        if (results.size < limit) {
            const seed = await metadata(apiClientProps, query.songId).catch(() => null);
            const genres = seed?.Genre?.length
                ? seed.Genre
                : seed?.parentRatingKey
                  ? (await metadata(apiClientProps, seed.parentRatingKey).catch(() => null))?.Genre
                  : undefined;
            if (genres?.length) {
                const byGenre = await songList({
                    apiClientProps,
                    query: {
                        genreIds: [genres[0].id ?? genres[0].tag],
                        limit: limit + 1,
                        musicFolderId: query.musicFolderId,
                        sortBy: SongListSort.RANDOM,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                });
                for (const song of byGenre.items) addSong(song);
            }
            if (results.size < limit && seed?.grandparentRatingKey) {
                const byArtist = await songList({
                    apiClientProps,
                    query: {
                        artistIds: [seed.grandparentRatingKey],
                        limit: limit + 1,
                        musicFolderId: query.musicFolderId,
                        sortBy: SongListSort.RANDOM,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                });
                for (const song of byArtist.items) addSong(song);
            }
        }
        return [...results.values()];
    },
    getSongDetail: async ({ apiClientProps, query }) =>
        plexNormalize.song(
            await metadata(apiClientProps, query.id),
            requiredServer(apiClientProps),
        ),
    getSongList: songList,
    getSongListCount: async ({ apiClientProps, query }) =>
        (await songListWithGenreFallback(apiClientProps, { ...query, limit: 0 })).totalRecordCount,
    getStreamUrl: async ({ apiClientProps, query }) => {
        if (!query.transcode) return fileUrl(apiClientProps, query.id);
        const base = getServerUrl(apiClientProps.server, apiClientProps.forceRemoteUrl);
        if (!base) throw new Error('Plex server is required');
        const codec = ['aac', 'flac', 'mp3', 'opus'].includes(query.format?.toLowerCase() ?? '')
            ? query.format!.toLowerCase()
            : 'mp3';
        const ext = codec === 'aac' ? 'm4a' : codec;
        const url = plexUrl(base, `/music/:/transcode/universal/start.${ext}`);
        const params = {
            audioBitrate: String(query.bitrate || 320),
            audioCodec: codec,
            directPlay: '0',
            directStream: '0',
            mediaIndex: '0',
            offset: String(query.startTime ?? 0),
            partIndex: '0',
            path: `/library/metadata/${encodeURIComponent(query.id)}`,
            protocol: 'http',
            ...plexHeaders(requiredServer(apiClientProps).credential),
        };
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        return url.toString();
    },
    getTopSongs: async ({ apiClientProps, query }) => {
        if (query.type !== 'personal') {
            const artist = await metadata(apiClientProps, query.artistId, {
                includePopularLeaves: 1,
            }).catch(() => null);
            const popular = (artist?.PopularLeaves?.Metadata ?? []).filter(
                (entry) => entry.type === 'track',
            );
            if (popular.length) {
                const items = popular
                    .slice(0, query.limit ?? popular.length)
                    .map((entry) => plexNormalize.song(entry, requiredServer(apiClientProps)));
                return { items, startIndex: 0, totalRecordCount: items.length };
            }
        }
        return songList({
            apiClientProps,
            query: {
                artistIds: [query.artistId],
                limit: query.limit,
                sortBy: SongListSort.PLAY_COUNT,
                sortOrder: SortOrder.DESC,
                startIndex: 0,
            },
        });
    },
    getUserInfo: async ({ apiClientProps }) => {
        await sections(apiClientProps);
        const server = requiredServer(apiClientProps);
        return { id: server.userId ?? 'plex', isAdmin: false, name: server.username };
    },
    movePlaylistItem: async ({ apiClientProps, query }) => {
        await assertEditablePlaylist(apiClientProps, query.playlistId);
        const entries = await playlistItems(apiClientProps, query.playlistId);
        const from = entries.findIndex((entry) => entry.playlistItemID === query.trackId);
        if (
            from < 0 ||
            !Number.isInteger(query.endingIndex) ||
            query.endingIndex < 0 ||
            query.endingIndex >= entries.length
        )
            throw new Error('Invalid Plex playlist position');
        const [entry] = entries.splice(from, 1);
        entries.splice(query.endingIndex, 0, entry);
        const after = entries[query.endingIndex - 1]?.playlistItemID;
        await plexMutation(
            apiClientProps,
            `/playlists/${encodeURIComponent(query.playlistId)}/items/${encodeURIComponent(query.trackId)}/move`,
            after ? { after } : {},
        );
    },
    refreshItems: async ({ apiClientProps, query }) => {
        for (const id of query.ids)
            await plexMutation(
                apiClientProps,
                `/library/metadata/${encodeURIComponent(id)}/refresh`,
            );
        return null;
    },
    removeFromPlaylist: async ({ apiClientProps, query }) => {
        await assertEditablePlaylist(apiClientProps, query.id);
        for (const id of query.songId)
            await plexMutation(
                apiClientProps,
                `/playlists/${encodeURIComponent(query.id)}/items/${encodeURIComponent(id)}`,
                {},
                'DELETE',
            );
        return null;
    },
    replacePlaylist,
    savePlayQueue: unsupported,
    scrobble: async ({ apiClientProps, query }) => {
        if (query.submission) {
            await plexMutation(
                apiClientProps,
                '/:/scrobble',
                { identifier: 'com.plexapp.plugins.library', key: query.id },
                'GET',
            );
            return null;
        }
        if (!query.event) return null;
        const duration = query.duration ?? (await metadata(apiClientProps, query.id)).duration ?? 0;
        const position = query.position ?? 0;
        if (
            !Number.isFinite(duration) ||
            duration < 0 ||
            !Number.isFinite(position) ||
            position < 0
        )
            throw new Error('Invalid Plex playback position or duration');
        await plexMutation(
            apiClientProps,
            '/:/timeline',
            {
                duration: Math.round(duration),
                identifier: 'com.plexapp.plugins.library',
                key: `/library/metadata/${encodeURIComponent(query.id)}`,
                ratingKey: query.id,
                state:
                    query.event === 'stop'
                        ? 'stopped'
                        : query.event === 'pause'
                          ? 'paused'
                          : 'playing',
                time: Math.round(position),
            },
            'GET',
        );
        return null;
    },
    search: async ({ apiClientProps, query }) => {
        const base = {
            musicFolderId: query.musicFolderId,
            searchTerm: query.query,
            sortOrder: SortOrder.ASC,
        };
        const [artists, albums, songs] = await Promise.all([
            query.albumArtistLimit === 0
                ? { items: [] }
                : artistList({
                      apiClientProps,
                      query: {
                          ...base,
                          limit: query.albumArtistLimit ?? 20,
                          sortBy: AlbumArtistListSort.NAME,
                          startIndex: query.albumArtistStartIndex ?? 0,
                      },
                  }),
            query.albumLimit === 0
                ? { items: [] }
                : albumList({
                      apiClientProps,
                      query: {
                          ...base,
                          limit: query.albumLimit ?? 20,
                          sortBy: AlbumListSort.NAME,
                          startIndex: query.albumStartIndex ?? 0,
                      },
                  }),
            query.songLimit === 0
                ? { items: [] }
                : songList({
                      apiClientProps,
                      query: {
                          ...base,
                          limit: query.songLimit ?? 20,
                          sortBy: SongListSort.NAME,
                          startIndex: query.songStartIndex ?? 0,
                      },
                  }),
        ]);
        return { albumArtists: artists.items, albums: albums.items, songs: songs.items };
    },
    setPlaylistSongs: async ({ apiClientProps, body }) => {
        await assertEditablePlaylist(apiClientProps, body.id);
        const entries = await playlistItems(apiClientProps, body.id);
        const remaining = [...entries];
        // Match occurrences, not just track IDs: duplicates have distinct playlist entry IDs.
        // ponytail: quadratic matching; index occurrences if very large playlist edits become slow.
        const ordered = body.songIds.map((id) => {
            const index = remaining.findIndex((entry) => entry.ratingKey === id);
            return index < 0 ? undefined : remaining.splice(index, 1)[0];
        });
        if (!remaining.length && ordered.every((entry) => entry !== undefined)) {
            if (entries.some((entry) => !entry.playlistItemID))
                throw new Error('Plex playlist entry ID is missing');
            // A pure reorder must not append/delete tracks or change their occurrence IDs.
            for (const [index, entry] of ordered.entries()) {
                const from = entries.findIndex(
                    (item) => item.playlistItemID === entry!.playlistItemID,
                );
                if (from === index) continue;
                const after = entries[index - 1]?.playlistItemID;
                await plexMutation(
                    apiClientProps,
                    `/playlists/${encodeURIComponent(body.id)}/items/${encodeURIComponent(entry!.playlistItemID!)}/move`,
                    after ? { after } : {},
                );
                entries.splice(index, 0, entries.splice(from, 1)[0]);
            }
            return null;
        }
        await replacePlaylist({
            apiClientProps,
            body: { songId: body.songIds },
            query: { id: body.id },
        });
        return null;
    },
    setRating: async ({ apiClientProps, query }) => {
        if (!Number.isFinite(query.rating) || query.rating < 0 || query.rating > 5)
            throw new Error('Invalid Plex rating');
        for (const id of query.id)
            await plexMutation(apiClientProps, '/:/rate', {
                identifier: 'com.plexapp.plugins.library',
                key: id,
                rating: query.rating * 2,
            });
        return null;
    },
    startLibraryScan: async ({ apiClientProps }) => {
        for (const folder of await sections(apiClientProps))
            await plexMutation(
                apiClientProps,
                `/library/sections/${encodeURIComponent(folder.key)}/refresh`,
                {},
                'GET',
            );
        return null;
    },
    updateInternetRadioStation: async ({ apiClientProps, body, query }) => {
        const serverId = apiClientProps.server?.id;
        if (!serverId) throw new Error('Plex server is required');
        useRadioStore.getState().actions.updateStation(serverId, query.id, {
            homepageUrl: body.homepageUrl || null,
            name: body.name,
            streamUrl: body.streamUrl,
        });
        return null;
    },
    updatePlaylist: async ({ apiClientProps, body, query }) => {
        await assertAudioPlaylist(apiClientProps, query.id);
        await plexMutation(apiClientProps, `/playlists/${encodeURIComponent(query.id)}`, {
            summary: body.comment,
            title: body.name,
        });
        return null;
    },
};
