import { injectable } from 'inversify';
import * as fs from 'fs';
import { Observable, Observer, Subject } from 'rxjs';
import { Decoder } from 'lame';
import * as Speaker from 'speaker';

import { Song } from './api';
import { EventEmitter, EventData } from './bus';

export class SongStartedEvent implements EventData {
  readonly type = 'song_started';
  constructor(readonly song: Song) {}
}

export class SongFinishedEvent implements EventData {
  readonly type = 'song_finished';
  constructor(readonly song: Song) {}
}

export interface Player extends EventEmitter {
  play(song: Song): Observable<any>;
  currentSong: Song | null;
  stop(): Observable<any>;
}

export const PlayerSymbol = Symbol.for('Player');

class Play {
  readonly events = new Subject<SongStartedEvent | SongFinishedEvent>();
  private speaker: any;

  constructor(readonly song: Song, format: any, private stream: any) {
    this.speaker = new Speaker(format);
    this.speaker.on('close', () => {
      this.events.next(new SongFinishedEvent(this.song));
      this.events.complete();
    });
  }

  start(): void {
    this.stream.pipe(this.speaker);
    this.events.next(new SongStartedEvent(this.song));
  }

  stop(): Observable<any> {
    return Observable.create((obs: Observer<any>) => {
      this.speaker.on('close', () => {
        obs.next(null);
        obs.complete();
      });

      this.stream.unpipe();
      this.speaker.end();
    });
  }
}

@injectable()
export class PlayerImpl implements Player {
  private currentPlay: Play;
  private readonly _events = new Subject<EventData>();
  readonly events = this._events.asObservable();

  get currentSong() {
    return this.currentPlay && this.currentPlay.song;
  }

  play(song: Song): Observable<any> {
    return this.stop().mergeMap(() => this.doPlaySong(song));
  }

  private doPlaySong(song: Song): Observable<any> {
    const stream = fs.createReadStream(song.file);
    const lame = new Decoder();

    return Observable.create((obs: Observer<any>) => {
      const mp3stream = stream.pipe(lame);
      mp3stream
        .once('format', (format: any) => {
          const play = new Play(song, format, mp3stream);
          this.currentPlay = play;
          play.events.subscribe(evt => this._events.next(evt));
          obs.next(play);
          play.start();
        })
        .on('error', (err: Error) => obs.error(err));
    });
  }
  stop(): Observable<any> {
    if (!this.currentPlay) return Observable.of(null);
    return this.currentPlay.stop().do(() => (this.currentPlay = null));
  }
}