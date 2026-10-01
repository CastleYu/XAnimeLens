import { Inject } from './inject';

class App {
  static boot(): void {
    Inject.boot();
  }
}

App.boot();
