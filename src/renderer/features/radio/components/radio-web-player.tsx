import { useCallback, useEffect, useRef, useState } from 'react';

import {
    useWebAudioMediaSlot,
    WebPlayerEngine,
    WebPlayerEngineHandle,
} from '/@/renderer/features/player/audio-player/engine/web-player-engine';
import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { useWebAudio } from '/@/renderer/features/player/hooks/use-webaudio';
import {
    useIsRadioActive,
    useRadioPlayer,
    useRadioStore,
} from '/@/renderer/features/radio/hooks/use-radio-player';
import { usePlaybackSettings, usePlayerMuted, usePlayerVolume } from '/@/renderer/store';
import { toast } from '/@/shared/components/toast/toast';
import { PlayerStatus } from '/@/shared/types/types';

export function RadioWebPlayer() {
    const playerRef = useRef<null | WebPlayerEngineHandle>(null);
    const { currentStreamUrl, isPlaying } = useRadioPlayer();
    const { actions } = useRadioStore();
    const { setCurrentStreamUrl, setIsPlaying, setStationName } = actions;
    const isRadioActive = useIsRadioActive();
    const isMuted = usePlayerMuted();
    const volume = usePlayerVolume();
    const { preservePitch, webAudio: webAudioEnabled } = usePlaybackSettings();
    const { webAudio } = useWebAudio();

    const [playerStatus, setPlayerStatus] = useState<PlayerStatus>(
        isPlaying ? PlayerStatus.PLAYING : PlayerStatus.PAUSED,
    );

    usePlayerEvents(
        {
            onPlayerVolume: (properties) => {
                const volume = properties.volume;
                playerRef.current?.setVolume(volume);
            },
        },
        [volume],
    );

    useEffect(() => {
        setPlayerStatus(isPlaying ? PlayerStatus.PLAYING : PlayerStatus.PAUSED);
    }, [isPlaying]);

    const player1Slot = useWebAudioMediaSlot({
        enabled: webAudioEnabled,
        gainNode: webAudio?.gains[0],
        src: currentStreamUrl || undefined,
        webAudio,
    });
    const player1Source = player1Slot.sourceNode;

    useEffect(() => {
        if (!webAudio || !player1Source) return;

        const linearVolume = volume / 100;
        const gainValue = isMuted ? 0 : linearVolume;

        try {
            webAudio.gains[0].gain.setValueAtTime(gainValue, 0);
        } catch (error) {
            console.error('Error setting radio volume gain', error);
        }
    }, [volume, isMuted, webAudio, player1Source]);

    const onProgressPlayer1 = useCallback(() => {
        // We don't need to handle progress for radio streams
    }, []);

    const onEndedPlayer1 = useCallback(() => {
        console.error('Radio stream ended unexpectedly');
        setIsPlaying(false);
        setCurrentStreamUrl(null);
        setStationName(null);
        toast.error({ message: 'Radio stream ended unexpectedly' });
    }, [setIsPlaying, setCurrentStreamUrl, setStationName]);

    if (!isRadioActive) {
        return null;
    }

    return (
        <WebPlayerEngine
            isMuted={isMuted}
            isTransitioning={false}
            loopPlayer1={false}
            loopPlayer2={false}
            onCrossOriginFallback1={player1Slot.handleCrossOriginFallback}
            onEndedPlayer1={onEndedPlayer1}
            onEndedPlayer2={() => {}}
            onErrorPause={() => {}}
            onProgressPlayer1={onProgressPlayer1}
            onProgressPlayer2={() => {}}
            onStartedPlayer1={player1Slot.handleStart}
            onStartedPlayer2={() => {}}
            playerNum={1}
            playerRef={playerRef}
            playerStatus={playerStatus}
            preservesPitch={preservePitch}
            speed={1}
            src1={currentStreamUrl || undefined}
            src2={undefined}
            useCrossOrigin1={player1Slot.useCrossOrigin}
            volume={volume}
        />
    );
}
