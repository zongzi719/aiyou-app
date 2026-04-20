import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

type LegacyAudioMode = {
  playsInSilentModeIOS?: boolean;
  allowsRecordingIOS?: boolean;
  staysActiveInBackground?: boolean;
  shouldDuckAndroid?: boolean;
};

type LegacyPlaybackStatus = {
  isLoaded: boolean;
  didJustFinish?: boolean;
  error?: string;
};

type StatusListener = (status: LegacyPlaybackStatus) => void;

class LegacySound {
  private listenerSubscription: { remove: () => void } | null = null;
  private listener: StatusListener | null = null;

  constructor(private readonly player: ReturnType<typeof createAudioPlayer>) {}

  setOnPlaybackStatusUpdate(listener: StatusListener | null): void {
    this.listener = listener;
    this.listenerSubscription?.remove();
    this.listenerSubscription = null;

    if (!listener) return;

    this.listenerSubscription = this.player.addListener('playbackStatusUpdate', (status) => {
      listener({
        isLoaded: status.isLoaded,
        didJustFinish: status.didJustFinish,
      });
    });
  }

  async unloadAsync(): Promise<void> {
    this.listenerSubscription?.remove();
    this.listenerSubscription = null;
    this.listener = null;
    this.player.remove();
  }
}

async function setLegacyAudioModeAsync(mode: LegacyAudioMode): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: mode.playsInSilentModeIOS ?? true,
    allowsRecording: mode.allowsRecordingIOS ?? false,
    shouldPlayInBackground: mode.staysActiveInBackground ?? false,
    interruptionMode: mode.shouldDuckAndroid ? 'duckOthers' : 'mixWithOthers',
  });
}

async function createLegacySoundAsync(
  source: { uri: string },
  initialStatus?: { shouldPlay?: boolean; volume?: number }
): Promise<{ sound: LegacySound; status: LegacyPlaybackStatus }> {
  const player = createAudioPlayer(source.uri);
  if (typeof initialStatus?.volume === 'number') {
    player.volume = initialStatus.volume;
  }

  const sound = new LegacySound(player);
  if (initialStatus?.shouldPlay) {
    player.play();
  }

  return {
    sound,
    status: {
      isLoaded: player.isLoaded,
      didJustFinish: false,
    },
  };
}

export const Audio = {
  setAudioModeAsync: setLegacyAudioModeAsync,
  Sound: {
    createAsync: createLegacySoundAsync,
  },
};

