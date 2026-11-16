import { useSuspenseQuery } from '@tanstack/react-query';
import { ChangeEvent, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getItemImageUrl } from '/@/renderer/components/item-image/item-image';
import { artistsQueries } from '/@/renderer/features/artists/api/artists-api';
import { useGenreList } from '/@/renderer/features/genres/api/genres-api';
import {
    ArtistMultiSelectRow,
    GenreMultiSelectRow,
} from '/@/renderer/features/shared/components/multi-select-rows';
import { useSongListFilters } from '/@/renderer/features/songs/hooks/use-song-list-filters';
import { useCurrentServer, useCurrentServerId } from '/@/renderer/store';
import { useAppStore, useAppStoreActions } from '/@/renderer/store/app.store';
import { Divider } from '/@/shared/components/divider/divider';
import { Group } from '/@/shared/components/group/group';
import { VirtualMultiSelect } from '/@/shared/components/multi-select/virtual-multi-select';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Stack } from '/@/shared/components/stack/stack';
import { Switch } from '/@/shared/components/switch/switch';
import { Text } from '/@/shared/components/text/text';
import { useDebouncedCallback } from '/@/shared/hooks/use-debounced-callback';
import {
    AlbumArtistListSort,
    LibraryItem,
    ServerType,
    SortOrder,
} from '/@/shared/types/domain-types';

interface SubsonicSongFiltersProps {
    disableArtistFilter?: boolean;
    disableGenreFilter?: boolean;
}

export const SubsonicSongFilters = ({
    disableArtistFilter,
    disableGenreFilter,
}: SubsonicSongFiltersProps) => {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const serverId = useCurrentServerId();
    const isPlex = server?.type === ServerType.PLEX;
    const { query, setArtistIds, setFavorite, setGenreId, setMaxYear, setMinYear } =
        useSongListFilters();

    const genreListQuery = useGenreList();

    const genreList = useMemo(() => {
        if (!genreListQuery.data) return [];
        return genreListQuery.data.items.map((genre) => ({
            albumCount: genre.albumCount,
            label: genre.name,
            songCount: genre.songCount,
            value: genre.id,
        }));
    }, [genreListQuery.data]);

    const selectedGenreIds = useMemo(() => query.genreIds || [], [query.genreIds]);

    const albumArtistListQuery = useSuspenseQuery(
        artistsQueries.albumArtistList({
            options: {
                gcTime: 1000 * 60 * 2,
                staleTime: 1000 * 60 * 1,
            },
            query: {
                sortBy: AlbumArtistListSort.NAME,
                sortOrder: SortOrder.ASC,
                startIndex: 0,
            },
            serverId,
        }),
    );

    const items = albumArtistListQuery?.data?.items;

    const selectableAlbumArtists = useMemo(() => {
        if (!items) return [];

        return items.map((artist) => ({
            albumCount: artist.albumCount,
            blurHash: artist.blurHash,
            imageUrl: getItemImageUrl({
                id: artist.id,
                itemType: LibraryItem.ARTIST,
                type: 'table',
            }),
            label: artist.name,
            songCount: artist.songCount,
            thumbHash: artist.thumbHash,
            value: artist.id,
        }));
    }, [items]);

    const selectedArtistIds = useMemo(() => query.artistIds || [], [query.artistIds]);

    const hasFavorite = query.favorite === true;
    const hasArtist = query.artistIds && query.artistIds.length > 0;
    const hasGenre = query.genreIds && query.genreIds.length > 0;

    const isFavoriteDisabled = !isPlex && (hasArtist || hasGenre);
    const isArtistDisabled = !isPlex && (hasFavorite || hasGenre);
    const isGenreDisabled = !isPlex && (hasFavorite || hasArtist);

    const artistSelectMode = useAppStore((state) => state.artistSelectMode);
    const genreSelectMode = useAppStore((state) => state.genreSelectMode);
    const { setArtistSelectMode, setGenreSelectMode } = useAppStoreActions();

    const handleArtistFilter = useCallback(
        (e: null | string[]) => {
            if (isArtistDisabled && e !== null) return;
            setArtistIds(e && e.length > 0 ? (isPlex ? e : [e[0]]) : null);
        },
        [isArtistDisabled, isPlex, setArtistIds],
    );

    const handleArtistSelectModeChange = useCallback(
        (value: string) => {
            const newMode = value as 'multi' | 'single';
            setArtistSelectMode(newMode);
            if (newMode === 'single' && selectedArtistIds.length > 1) {
                setArtistIds([selectedArtistIds[0]]);
            }
        },
        [selectedArtistIds, setArtistIds, setArtistSelectMode],
    );

    const artistFilterLabel = useMemo(() => {
        if (!isPlex) {
            return (
                <Text fw={500} size="sm">
                    {t('entity.artist', { count: 2 })}
                </Text>
            );
        }
        return (
            <Group gap="xs" justify="space-between" w="100%">
                <Text fw={500} size="sm">
                    {t('entity.artist', { count: 2 })}
                </Text>
                <SegmentedControl
                    data={[
                        { label: t('common.filter_single'), value: 'single' },
                        { label: t('common.filter_multiple'), value: 'multi' },
                    ]}
                    onChange={handleArtistSelectModeChange}
                    size="xs"
                    value={artistSelectMode}
                />
            </Group>
        );
    }, [artistSelectMode, handleArtistSelectModeChange, isPlex, t]);

    const handleGenresFilter = useCallback(
        (e: null | string[]) => {
            if (isGenreDisabled && e !== null && e.length > 0) return;
            if (e && e.length > 0) {
                setGenreId(isPlex ? e : [e[0]]);
            } else {
                setGenreId(null);
            }
        },
        [isGenreDisabled, isPlex, setGenreId],
    );

    const handleGenreSelectModeChange = useCallback(
        (value: string) => {
            const newMode = value as 'multi' | 'single';
            setGenreSelectMode(newMode);
            if (newMode === 'single' && selectedGenreIds.length > 1) {
                setGenreId([selectedGenreIds[0]]);
            }
        },
        [selectedGenreIds, setGenreId, setGenreSelectMode],
    );

    const genreFilterLabel = useMemo(() => {
        if (!isPlex) {
            return (
                <Text fw={500} size="sm">
                    {t('entity.genre', { count: 1 })}
                </Text>
            );
        }
        return (
            <Group gap="xs" justify="space-between" w="100%">
                <Text fw={500} size="sm">
                    {t('entity.genre', { count: 2 })}
                </Text>
                <SegmentedControl
                    data={[
                        { label: t('common.filter_single'), value: 'single' },
                        { label: t('common.filter_multiple'), value: 'multi' },
                    ]}
                    onChange={handleGenreSelectModeChange}
                    size="xs"
                    value={genreSelectMode}
                />
            </Group>
        );
    }, [genreSelectMode, handleGenreSelectModeChange, isPlex, t]);

    const handleMinYearFilter = useDebouncedCallback((e: number | string) => {
        const year = typeof e === 'number' ? e : Number(e);
        setMinYear(e !== '' && e !== null && Number.isFinite(year) && year > 0 ? year : null);
    }, 300);

    const handleMaxYearFilter = useDebouncedCallback((e: number | string) => {
        const year = typeof e === 'number' ? e : Number(e);
        setMaxYear(e !== '' && e !== null && Number.isFinite(year) && year > 0 ? year : null);
    }, 300);

    const toggleFilters = useMemo(
        () => [
            {
                label: t('filter.isFavorited'),
                onChange: (e: ChangeEvent<HTMLInputElement>) => {
                    if (isFavoriteDisabled && e.target.checked) return;
                    const favoriteValue = e.target.checked ? true : undefined;
                    setFavorite(favoriteValue ?? null);
                },
                value: query.favorite,
            },
        ],
        [isFavoriteDisabled, query.favorite, setFavorite, t],
    );

    return (
        <Stack px="md" py="md">
            {toggleFilters.map((filter) => (
                <Group justify="space-between" key={`ss-filter-${filter.label}`}>
                    <Text>{filter.label}</Text>
                    <Switch
                        checked={filter.value ?? false}
                        disabled={isFavoriteDisabled}
                        onChange={filter.onChange}
                    />
                </Group>
            ))}
            {!disableArtistFilter && (
                <>
                    <Divider my="md" />
                    <VirtualMultiSelect
                        disabled={isArtistDisabled}
                        displayCountType="song"
                        height={300}
                        isLoading={albumArtistListQuery.isFetching}
                        label={artistFilterLabel}
                        onChange={handleArtistFilter}
                        options={selectableAlbumArtists}
                        RowComponent={ArtistMultiSelectRow}
                        singleSelect={!isPlex || artistSelectMode === 'single'}
                        value={selectedArtistIds}
                    />
                </>
            )}
            {!disableGenreFilter && (
                <>
                    <Divider my="md" />
                    <VirtualMultiSelect
                        disabled={isGenreDisabled}
                        displayCountType="song"
                        height={220}
                        isLoading={genreListQuery.isFetching}
                        label={genreFilterLabel}
                        onChange={handleGenresFilter}
                        options={genreList}
                        RowComponent={GenreMultiSelectRow}
                        singleSelect={!isPlex || genreSelectMode === 'single'}
                        value={selectedGenreIds}
                    />
                </>
            )}
            {isPlex && (
                <>
                    <Divider my="md" />
                    <Group grow>
                        <NumberInput
                            hideControls={false}
                            label={t('filter.fromYear')}
                            max={5000}
                            min={0}
                            onChange={handleMinYearFilter}
                            value={query.minYear ?? undefined}
                        />
                        <NumberInput
                            hideControls={false}
                            label={t('filter.toYear')}
                            max={5000}
                            min={0}
                            onChange={handleMaxYearFilter}
                            value={query.maxYear ?? undefined}
                        />
                    </Group>
                </>
            )}
        </Stack>
    );
};
