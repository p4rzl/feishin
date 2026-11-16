import type { RefObject } from 'react';
import type ReactPlayer from 'react-player';

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { AudioPlayer, PlayerOnProgressProps } from '/@/renderer/features/player/audio-player/types';
import { convertToLogVolume } from '/@/renderer/features/player/audio-player/utils/player-utils';
import { logger } from '/@/renderer/utils/logger';
import { PlayerStatus, WebAudio } from '/@/shared/types/types';

export interface WebPlayerEngineHandle extends AudioPlayer {
    player1(): {
        ref: null | ReactPlayer;
        setVolume: (volume: number) => void;
    };
    player2(): {
        ref: null | ReactPlayer;
        setVolume: (volume: number) => void;
    };
}

interface WebPlayerEngineProps {
    isMuted: boolean;
    isTransitioning: boolean;
    loopPlayer1: boolean;
    loopPlayer2: boolean;
    onCrossOriginFallback1?: (url: string) => void;
    onCrossOriginFallback2?: (url: string) => void;
    onEndedPlayer1: () => void;
    onEndedPlayer2: () => void;
    onErrorPause: () => void;
    onProgressPlayer1: (e: PlayerOnProgressProps) => void;
    onProgressPlayer2: (e: PlayerOnProgressProps) => void;
    onStartedPlayer1: (player: ReactPlayer) => void;
    onStartedPlayer2: (player: ReactPlayer) => void;
    playerNum: number;
    playerRef: RefObject<null | WebPlayerEngineHandle>;
    playerStatus: PlayerStatus;
    preservesPitch: boolean;
    speed?: number;
    src1: string | undefined;
    src2: string | undefined;
    useCrossOrigin1?: boolean;
    useCrossOrigin2?: boolean;
    volume: number;
}

const MAX_NETWORK_RETRIES = 5;
const NETWORK_RETRY_DELAY_MS = 2000;
const nonCorsMediaOrigins = new Set<string>();

const isHttpUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value));

const getMediaOrigin = (url?: string): null | string => {
    if (!isHttpUrl(url)) return null;
    try {
        return new URL(url!).origin;
    } catch {
        return null;
    }
};

export const useWebAudioMediaSlot = ({
    enabled,
    gainNode,
    onAfterStart,
    src,
    webAudio,
}: {
    enabled: boolean;
    gainNode?: GainNode;
    onAfterStart?: (player: ReactPlayer) => void;
    src?: string;
    webAudio?: WebAudio;
}) => {
    const [corsBypassedUrl, setCorsBypassedUrl] = useState<null | string>(null);
    const [sourceNode, setSourceNode] = useState<MediaElementAudioSourceNode | null>(null);
    const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
    const processedElementRef = useRef<HTMLMediaElement | null>(null);
    const pendingCorsOriginUrlRef = useRef<null | string>(null);

    const origin = getMediaOrigin(src);
    const useCrossOrigin =
        Boolean(enabled) && corsBypassedUrl !== src && !(origin && nonCorsMediaOrigins.has(origin));

    const disconnectSource = useCallback(() => {
        if (sourceNodeRef.current) {
            try {
                sourceNodeRef.current.disconnect();
            } catch {
                // Ignore disconnect errors when swapping or unmounting audio elements
            }
            sourceNodeRef.current = null;
            setSourceNode(null);
        }
        processedElementRef.current = null;
    }, []);

    useEffect(() => {
        if (!enabled) {
            nonCorsMediaOrigins.clear();
            pendingCorsOriginUrlRef.current = null;
            setCorsBypassedUrl(null);
            disconnectSource();
        }
    }, [disconnectSource, enabled]);

    useEffect(() => {
        if (!useCrossOrigin) {
            disconnectSource();
        }
    }, [disconnectSource, useCrossOrigin]);

    useEffect(() => disconnectSource, [disconnectSource]);

    const handleCrossOriginFallback = useCallback(
        (failedUrl: string) => {
            disconnectSource();
            pendingCorsOriginUrlRef.current = failedUrl;
            setCorsBypassedUrl(failedUrl);
        },
        [disconnectSource],
    );

    const handleStart = useCallback(
        (reactPlayer: ReactPlayer) => {
            onAfterStart?.(reactPlayer);

            if (!useCrossOrigin) {
                if (src && pendingCorsOriginUrlRef.current === src) {
                    const resolvedOrigin = getMediaOrigin(src);
                    if (resolvedOrigin) {
                        nonCorsMediaOrigins.add(resolvedOrigin);
                    }
                    pendingCorsOriginUrlRef.current = null;
                }
                return;
            }

            if (!webAudio || !gainNode) return;

            const internal = reactPlayer.getInternalPlayer() as HTMLMediaElement | undefined;
            if (!internal || processedElementRef.current === internal) return;

            processedElementRef.current = internal;

            // Connect the MediaElementAudioSourceNode immediately rather than awaiting
            // AudioContext.resume(), which can stay pending without direct user activation.
            if (webAudio.context.state !== 'running') {
                void webAudio.context.resume().catch(() => {});
            }

            try {
                const source = webAudio.context.createMediaElementSource(internal);
                source.connect(gainNode);
                sourceNodeRef.current = source;
                setSourceNode(source);
            } catch {
                // Element already wired or incompatible; direct element volume stays active.
            }
        },
        [gainNode, onAfterStart, src, useCrossOrigin, webAudio],
    );

    return {
        handleCrossOriginFallback,
        handleStart,
        sourceNode,
        useCrossOrigin,
    };
};

// Store volume is 0-100; clamp the normalized result so HTMLMediaElement.volume
// never receives a value outside [0, 1] (throws IndexSizeError in some engines)
const normalizeVolume = (volume: number) => {
    return Math.min(1, Math.max(0, volume / 100 || 0));
};

// Credits: https://gist.github.com/novwhisky/8a1a0168b94f3b6abfaa?permalink_comment_id=1551393#gistcomment-1551393
// This is used so that the player will always have an <audio> element. This means that
// player1Source and player2Source are connected BEFORE the user presses play for
// the first time. This workaround is important for Safari, which seems to require the
// source to be connected PRIOR to resuming audio context
const EMPTY_SOURCE =
    'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU2LjM2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV6urq6urq6urq6urq6urq6urq6urq6urq6v////////////////////////////////8AAAAATGF2YzU2LjQxAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAAAAAAAAA0gAAAAATEFN//MUZAMAAAGkAAAAAAAAA0gAAAAARTMu//MUZAYAAAGkAAAAAAAAA0gAAAAAOTku//MUZAkAAAGkAAAAAAAAA0gAAAAANVVV';

export const WebPlayerEngine = (props: WebPlayerEngineProps) => {
    const {
        isMuted,
        isTransitioning,
        loopPlayer1,
        loopPlayer2,
        onCrossOriginFallback1,
        onCrossOriginFallback2,
        onEndedPlayer1,
        onEndedPlayer2,
        onErrorPause,
        onProgressPlayer1,
        onProgressPlayer2,
        onStartedPlayer1,
        onStartedPlayer2,
        playerNum,
        playerRef,
        playerStatus,
        preservesPitch,
        speed,
        src1,
        src2,
        useCrossOrigin1 = false,
        useCrossOrigin2 = false,
        volume,
    } = props;

    const player1Ref = useRef<null | ReactPlayer>(null);
    const player2Ref = useRef<null | ReactPlayer>(null);
    const networkRetryCount1 = useRef(0);
    const networkRetryCount2 = useRef(0);
    const [ReactPlayerComponent, setReactPlayerComponent] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadReactPlayer = async () => {
            try {
                const module = await import('react-player');
                if (isMounted) {
                    setReactPlayerComponent(() => module.default);
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Failed to load react-player:', error);
                setIsLoading(false);
            }
        };

        loadReactPlayer();

        return () => {
            isMounted = false;
        };
    }, []);

    const [internalVolume1, setInternalVolume1] = useState(() => normalizeVolume(volume));
    const [internalVolume2, setInternalVolume2] = useState(() => normalizeVolume(volume));

    useImperativeHandle<WebPlayerEngineHandle, WebPlayerEngineHandle>(playerRef, () => ({
        decreaseVolume(by: number) {
            setInternalVolume1(Math.max(0, internalVolume1 - by / 100));
            setInternalVolume2(Math.max(0, internalVolume2 - by / 100));
        },
        increaseVolume(by: number) {
            setInternalVolume1(Math.min(1, internalVolume1 + by / 100));
            setInternalVolume2(Math.min(1, internalVolume2 + by / 100));
        },
        pause() {
            player1Ref.current?.getInternalPlayer()?.pause();
            player2Ref.current?.getInternalPlayer()?.pause();
        },
        play() {
            player1Ref.current?.getInternalPlayer()?.pause();
            player2Ref.current?.getInternalPlayer()?.pause();
            if (playerNum === 1) {
                player1Ref.current?.getInternalPlayer()?.play();
            } else {
                player2Ref.current?.getInternalPlayer()?.play();
            }
        },
        player1() {
            return {
                ref: player1Ref?.current,
                setVolume: (volume: number) => setInternalVolume1(normalizeVolume(volume)),
            };
        },
        player2() {
            return {
                ref: player2Ref?.current,
                setVolume: (volume: number) => setInternalVolume2(normalizeVolume(volume)),
            };
        },
        seekTo(seekTo: number) {
            let type: 'fraction' | 'seconds' | undefined = undefined;

            if (seekTo < 1) {
                type = 'seconds';
            }

            playerNum === 1
                ? player1Ref.current?.seekTo(seekTo, type)
                : player2Ref.current?.seekTo(seekTo, type);
        },
        setVolume(volume: number) {
            setInternalVolume1(normalizeVolume(volume));
            setInternalVolume2(normalizeVolume(volume));
        },
        setVolume1(volume: number) {
            setInternalVolume1(normalizeVolume(volume));
        },
        setVolume2(volume: number) {
            setInternalVolume2(normalizeVolume(volume));
        },
    }));

    const volume1 = convertToLogVolume(internalVolume1);
    const volume2 = convertToLogVolume(internalVolume2);

    const pauseBothPlayers = useCallback(() => {
        player1Ref.current?.getInternalPlayer()?.pause();
        player2Ref.current?.getInternalPlayer()?.pause();
    }, []);

    const mediaErrorLabel = (code: number | undefined) => {
        switch (code) {
            case MediaError.MEDIA_ERR_ABORTED:
                return 'ABORTED';
            case MediaError.MEDIA_ERR_DECODE:
                return 'DECODE';
            case MediaError.MEDIA_ERR_NETWORK:
                return 'NETWORK';
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                return 'SRC_NOT_SUPPORTED';
            default:
                return 'unknown';
        }
    };

    const handleOnError = (
        playerRef: React.RefObject<null | ReactPlayer>,
        src: string | undefined,
        useCrossOrigin: boolean,
        onCrossOriginFallback: ((url: string) => void) | undefined,
        onEnded: () => void,
        onErrorPause: () => void,
        networkRetryCountRef: React.RefObject<number>,
    ) => {
        return (errorOrEvent: unknown) => {
            const { current: player } = playerRef;

            if (!player) {
                return;
            }

            // FilePlayer passes HTMLMediaElement.play() promise rejections here without an ErrorEvent target.
            // Ignore AbortError/NotSupportedError here: AbortError occurs during source swaps/unmounts and
            // NotSupportedError is handled cleanly by the <audio> element's MediaError handler above/below
            // (avoiding a microtask race with the CORS fallback remount). Only surface autoplay blocks.
            if (
                (errorOrEvent instanceof Error || errorOrEvent instanceof DOMException) &&
                !('target' in errorOrEvent)
            ) {
                if (errorOrEvent.name !== 'NotAllowedError') {
                    return;
                }
                const internal = player.getInternalPlayer();
                if (!(internal instanceof HTMLAudioElement) || !internal.isConnected) {
                    return;
                }
                logger.error('Playback blocked by browser autoplay policy', {
                    error: errorOrEvent.message,
                    name: errorOrEvent.name,
                });
                pauseBothPlayers();
                if (onErrorPause) {
                    onErrorPause();
                }
                return;
            }

            const target = (errorOrEvent as Partial<ErrorEvent> | undefined)?.target;

            if (!(target instanceof HTMLAudioElement) || !src) {
                return;
            }

            const { error } = target;
            const code = error?.code;
            const label = mediaErrorLabel(code);

            const isNetworkError =
                code === MediaError.MEDIA_ERR_NETWORK ||
                code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;

            if (isNetworkError && useCrossOrigin && onCrossOriginFallback && isHttpUrl(src)) {
                logger.warn('Playback CORS/source error under Web Audio, retrying directly', {
                    code,
                    label,
                });
                networkRetryCountRef.current = 0;
                onCrossOriginFallback(src);
                return;
            }

            if (isNetworkError) {
                if (networkRetryCountRef.current < MAX_NETWORK_RETRIES) {
                    networkRetryCountRef.current += 1;
                    logger.warn('Playback error, retrying', {
                        code,
                        label,
                        retryCount: networkRetryCountRef.current,
                    });
                    const audio = target;
                    const expectedSrc = audio.currentSrc || audio.src;
                    setTimeout(() => {
                        if (!audio.isConnected || (audio.currentSrc || audio.src) !== expectedSrc) {
                            return;
                        }
                        pauseBothPlayers();
                        audio.load();
                        audio.play().catch(() => {
                            logger.error('Playback error, retries exhausted', {
                                code,
                                label,
                                retryCount: networkRetryCountRef.current,
                            });
                        });
                    }, NETWORK_RETRY_DELAY_MS);
                    return;
                }
            }

            if (code !== MediaError.MEDIA_ERR_DECODE && !isNetworkError) {
                return;
            }

            pauseBothPlayers();
            if (code === MediaError.MEDIA_ERR_DECODE) {
                logger.error('Playback decode error, skipping track', {
                    code,
                    label,
                    retryCount: networkRetryCountRef.current,
                });
                onEnded();
            } else {
                logger.error('Playback error, pausing', {
                    code,
                    label,
                    retryCount: networkRetryCountRef.current,
                });
                if (onErrorPause) {
                    onErrorPause();
                }
            }
        };
    };

    useEffect(() => {
        networkRetryCount1.current = 0;
        networkRetryCount2.current = 0;
    }, [src1, src2]);

    // When not playing, always pause both players - even during a transition
    useEffect(() => {
        if (playerStatus !== PlayerStatus.PLAYING) {
            pauseBothPlayers();
            return;
        }
        if (isTransitioning) {
            return;
        }
        if (playerNum === 1) {
            player2Ref.current?.getInternalPlayer()?.pause();
        } else {
            player1Ref.current?.getInternalPlayer()?.pause();
        }
    }, [isTransitioning, playerNum, playerStatus, pauseBothPlayers]);

    useEffect(() => {
        const player1 = player1Ref.current?.getInternalPlayer();
        if (player1 && player1 instanceof HTMLAudioElement) {
            player1.preservesPitch = preservesPitch;
        }
        const player2 = player2Ref.current?.getInternalPlayer();
        if (player2 && player2 instanceof HTMLAudioElement) {
            player2.preservesPitch = preservesPitch;
        }
    }, [preservesPitch]);

    const createReadyHandler = (
        slot: 1 | 2,
        src: string | undefined,
        onStarted: (player: ReactPlayer) => void,
    ) => {
        return (player: ReactPlayer) => {
            const internal = player.getInternalPlayer();
            if (internal && internal instanceof HTMLAudioElement) {
                internal.preservesPitch = preservesPitch;
                if (
                    playerNum === slot &&
                    playerStatus === PlayerStatus.PLAYING &&
                    src &&
                    internal.paused
                ) {
                    internal.play().catch((err) => {
                        if (err?.name === 'NotAllowedError' && internal.isConnected) {
                            logger.error('Playback blocked by browser autoplay policy', {
                                error: err instanceof Error ? err.message : String(err),
                            });
                            pauseBothPlayers();
                            onErrorPause?.();
                        }
                    });
                }
            }
            onStarted(player);
        };
    };

    const handleOnReadyPlayer1 = useCallback(
        (player: ReactPlayer) => createReadyHandler(1, src1, onStartedPlayer1)(player),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            onErrorPause,
            onStartedPlayer1,
            pauseBothPlayers,
            playerNum,
            playerStatus,
            preservesPitch,
            src1,
        ],
    );

    const handleOnReadyPlayer2 = useCallback(
        (player: ReactPlayer) => createReadyHandler(2, src2, onStartedPlayer2)(player),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            onErrorPause,
            onStartedPlayer2,
            pauseBothPlayers,
            playerNum,
            playerStatus,
            preservesPitch,
            src2,
        ],
    );

    const playerConfig1 = useMemo(
        () => ({
            file: {
                attributes: useCrossOrigin1 ? { crossOrigin: 'anonymous' } : {},
                forceAudio: true,
            },
        }),
        [useCrossOrigin1],
    );

    const playerConfig2 = useMemo(
        () => ({
            file: {
                attributes: useCrossOrigin2 ? { crossOrigin: 'anonymous' } : {},
                forceAudio: true,
            },
        }),
        [useCrossOrigin2],
    );

    if (isLoading || !ReactPlayerComponent) {
        return <div id="web-player-engine" style={{ display: 'none' }} />;
    }

    return (
        <div id="web-player-engine" style={{ display: 'none' }}>
            <ReactPlayerComponent
                config={playerConfig1}
                controls={false}
                height={0}
                id="web-player-1"
                key={`web-player-1-${useCrossOrigin1 ? 'cors' : 'direct'}`}
                loop={loopPlayer1}
                muted={isMuted}
                onEnded={src1 && !loopPlayer1 ? () => onEndedPlayer1() : undefined}
                onError={handleOnError(
                    player1Ref,
                    src1,
                    useCrossOrigin1,
                    onCrossOriginFallback1,
                    () => onEndedPlayer1(),
                    onErrorPause,
                    networkRetryCount1,
                )}
                onProgress={onProgressPlayer1}
                onReady={handleOnReadyPlayer1}
                playbackRate={speed || 1}
                playing={Boolean(src1) && playerNum === 1 && playerStatus === PlayerStatus.PLAYING}
                progressInterval={isTransitioning ? 10 : 250}
                ref={player1Ref}
                url={src1 || EMPTY_SOURCE}
                volume={volume1}
                width={0}
            />
            <ReactPlayerComponent
                config={playerConfig2}
                controls={false}
                height={0}
                id="web-player-2"
                key={`web-player-2-${useCrossOrigin2 ? 'cors' : 'direct'}`}
                loop={loopPlayer2}
                muted={isMuted}
                onEnded={src2 && !loopPlayer2 ? () => onEndedPlayer2() : undefined}
                onError={handleOnError(
                    player2Ref,
                    src2,
                    useCrossOrigin2,
                    onCrossOriginFallback2,
                    () => onEndedPlayer2(),
                    onErrorPause,
                    networkRetryCount2,
                )}
                onProgress={onProgressPlayer2}
                onReady={handleOnReadyPlayer2}
                playbackRate={speed || 1}
                playing={Boolean(src2) && playerNum === 2 && playerStatus === PlayerStatus.PLAYING}
                progressInterval={isTransitioning ? 10 : 250}
                ref={player2Ref}
                url={src2 || EMPTY_SOURCE}
                volume={volume2}
                width={0}
            />
        </div>
    );
};

WebPlayerEngine.displayName = 'WebPlayerEngine';
