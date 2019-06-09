import { IResolvers, PubSub } from 'apollo-server-express';
import { filter } from 'rxjs/operators';
import { Readable } from 'stream';
import { ButtonId, PowerEvent, PowerState, Song, SongStartedEvent, tabidisco } from './lib';

type SuccessResult = { success: true };
type ErrorResult = { success: false; error: string };

type PayloadResult<T> = (SuccessResult & T) | ErrorResult;
type SimpleResult = PayloadResult<{}>;

interface Subscription {
  subscribe(): any;
}

function withPayload<Result = {}, Args = {}>(
  handler: (source?: any, args?: Args) => Promise<Result>
): (source?: any, args?: Args) => Promise<PayloadResult<Result>> {
  return async (source, args) => {
    try {
      const result = await handler(source, args);
      return { success: true, ...(result as any) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };
}

interface Upload {
  createReadStream(): Readable;
  filename: string;
  encoding: string;
}

interface AddSongArgs {
  id?: string;
  file: Promise<Upload>;
  description?: string;
}

interface DeleteSongArgs {
  id: string;
}

interface SetPowerArgs {
  power: boolean;
}

interface SimulateButtonPressArgs {
  button: ButtonId;
}

interface PlaySongArgs {
  id?: string;
}

interface Resolvers extends IResolvers<any, any> {
  Query: {
    songs(): Promise<Song[]>;
    currentSong(): Promise<Song | undefined>;
    power(): Promise<PowerState>;
  };
  Mutation: {
    playSong(source: any, args: PlaySongArgs): Promise<{ song: Song }>;
    stopSong(): Promise<SimpleResult>;
    addSong(source: any, args: AddSongArgs): Promise<PayloadResult<{ song: Song }>>;
    deleteSong(source: any, args: DeleteSongArgs): Promise<SimpleResult>;
    readToken(): Promise<PayloadResult<{ token: string }>>;
    setPower(source: any, args: SetPowerArgs): Promise<SimpleResult>;
    cancelShutdownTimer(): Promise<SimpleResult>;
    simulateButtonPress(source: any, args: SimulateButtonPressArgs): Promise<SimpleResult>;
  };
  Subscription: {
    power: Subscription;
    currentSong: Subscription;
  };
}

const events = new PubSub();
tabidisco.events.pipe(filter(e => e.type === 'power')).subscribe((evt: PowerEvent) => events.publish('power', { power: evt.state }));
tabidisco.events
  .pipe(filter(e => e.type === 'song_started'))
  .subscribe((evt: SongStartedEvent) => events.publish('currentSong', { currentSong: evt.song }));
tabidisco.events.pipe(filter(e => e.type === 'song_finished')).subscribe(() => events.publish('currentSong', { currentSong: null }));

function subscription(types: string[]): Subscription {
  return { subscribe: () => events.asyncIterator(types) };
}

export const resolvers: Resolvers = {
  Query: {
    songs: () => tabidisco.songs,
    power: () => Promise.resolve(tabidisco.power),
    currentSong: () => Promise.resolve(tabidisco.currentSong),
  },
  Mutation: {
    playSong: withPayload((_: any, { id }: PlaySongArgs) => tabidisco.playSong(id)),
    stopSong: withPayload(() => tabidisco.stop()),
    readToken: withPayload(async () => {
      const token = await tabidisco.readToken();
      return { token };
    }),
    addSong: withPayload(async (_, { id, file, description }) => {
      const data = await file;
      const song = await tabidisco.addSong(data.createReadStream(), data.filename, id, description);
      return { song };
    }),
    deleteSong: withPayload(async (_, { id }) => {
      await tabidisco.deleteSong(id);
      return null;
    }),
    setPower: withPayload((_: any, { power }: SetPowerArgs) => tabidisco.setPower(power)),
    cancelShutdownTimer: withPayload(() => {
      tabidisco.cancelShutdownTimer();
      return null;
    }),
    simulateButtonPress: withPayload((_: any, { button }: SimulateButtonPressArgs) => {
      tabidisco.simulateButtonPress(button);
      return null;
    }),
  },
  Subscription: {
    power: subscription(['power']),
    currentSong: subscription(['currentSong']),
  },
};