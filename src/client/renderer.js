const Daemon = require('./js/daemon/Daemon.js');

const app = new Daemon();
app.run();

global.app = app;
