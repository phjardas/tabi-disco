import { Observable, Observer, Subject } from 'rxjs';
import { injectable, inject } from 'inversify';

import { LogFactory, Log, LogFactorySymbol } from './../../log';
import { PiAdapter, ButtonId } from './api';

function randomToken() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
  const length = 32;
  let s = '';
  for (let i = 0; i < length; i++) {
    s += alphabet[Math.floor(alphabet.length * Math.random())];
  }
  return s;
}

@injectable()
export class MockPiAdapter implements PiAdapter {
  private readonly log: Log;
  private readonly _buttons = new Subject<ButtonId>();
  powered = false;
  readonly buttons = this._buttons.asObservable();

  constructor(@inject(LogFactorySymbol) logFactory: LogFactory) {
    this.log = logFactory.getLog('pi');
  }

  readToken(): Observable<string> {
    return Observable.create((obs: Observer<string>) => {
      this.log.info('reading token...');

      setTimeout(() => {
        if (Math.random() < 0.3) {
          this.log.info('no token found');
          obs.error(new Error('No token found'));
        } else {
          const token = randomToken();
          this.log.info(`token resolved: ${token}`);
          obs.next(token);
          obs.complete();
        }
      }, 1000);
    });
  }

  setPower(power: boolean) {
    if (power !== this.powered) {
      this.log.info(`turning power ${power ? 'on' : 'off'}`);
      this.powered = power;
    }

    return Observable.of(null);
  }
}