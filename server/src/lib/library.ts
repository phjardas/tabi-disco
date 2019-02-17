import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { promisify } from 'util';
import { parseTags, SongTags } from './mp3';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const deleteFile = promisify(fs.unlink);

export interface Song extends SongTags {
  readonly id: string;
  readonly file: string;
  readonly filename: string;
  readonly description?: string;
  readonly size: number;
  readonly plays: number;
  readonly lastPlayedAt?: string;
}

export interface Library {
  readonly songs: Promise<Song[]>;
  setSong(id: string, stream: Readable, filename: string, description?: string): Promise<{ song: Song; oldSong?: Song }>;
  deleteSong(id: string): Promise<{ oldSong?: Song }>;
  recordPlay(id: string): Promise<Song>;
}

type SongMap = { [id: string]: Song };

export class FileLibrary implements Library {
  private readonly dbDir: string;
  private readonly dbFile: string;

  constructor() {
    this.dbDir = process.env.TABIDISCO_DB_DIR || path.resolve('db');
    this.dbFile = path.resolve(this.dbDir, 'songs.json');
  }

  get songs(): Promise<Song[]> {
    return this.load().then(songs => Object.keys(songs).map(id => songs[id]));
  }

  async setSong(id: string, stream: Readable, originalFilename: string, description?: string): Promise<{ song: Song; oldSong?: Song }> {
    console.info('setting song %s', id);
    const filename = `${id}.mp3`;
    const fullFile = path.resolve(this.dbDir, filename);

    const { size } = await new Promise<{ size: number }>((resolve, reject) => {
      let size = 0;
      const out = fs.createWriteStream(fullFile);
      out.on('error', reject);
      stream.on('error', reject);
      stream.on('data', chunk => {
        out.write(chunk);
        size += chunk.length;
      });
      stream.on('end', () => {
        out.end();
        resolve({ size });
      });
    });

    const [songs, tags] = await Promise.all([this.load(), parseTags(fullFile)]);
    const song = {
      id,
      file: filename,
      description,
      size,
      filename: originalFilename,
      plays: 0,
      ...tags,
    };

    const oldSong = songs[id];
    await this.save({ ...songs, [id]: song });

    if (oldSong) {
      console.info('[library] updated song %s', id);
      return { song, oldSong };
    } else {
      console.info('[library] added song %s', id);
      return { song };
    }
  }

  async deleteSong(id: string): Promise<{ oldSong?: Song }> {
    const songs = await this.load();
    const song = songs[id];
    if (!song) return {};

    console.info('[library] deleting song %s', id);
    await deleteFile(path.resolve(this.dbDir, song.file));
    delete songs[id];
    await this.save(songs);
    return { oldSong: song };
  }

  async recordPlay(id: string): Promise<Song> {
    const songs = await this.load();
    const song = songs[id];
    if (!song) throw new Error(`Song not found: ${id}`);

    const newSong = {
      ...song,
      plays: (song.plays || 0) + 1,
      lastPlayedAt: new Date().toISOString(),
    };

    await this.save({
      ...songs,
      [id]: newSong,
    });

    return { ...newSong, file: path.resolve(this.dbDir, newSong.file) };
  }

  private async load(): Promise<SongMap> {
    try {
      const data = await readFile(this.dbFile, 'utf-8');
      const songs: Song[] = JSON.parse(data || '[]');
      return songs
        .map(song => ({
          ...song,
          plays: song.plays || 0,
          file: path.resolve(this.dbDir, song.file),
        }))
        .reduce(
          (a, b) => ({
            ...a,
            [b.id]: b,
          }),
          {}
        );
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }

      throw error;
    }
  }

  private async save(songs: SongMap): Promise<any> {
    const data = JSON.stringify(Object.keys(songs).map(id => songs[id]), null, 2);
    await writeFile(this.dbFile, data, 'utf-8');
  }
}
