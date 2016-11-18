'use strict';

const electron = require('electron')

const assert = require('assert');
const debug = require('debug')('capsule.config');
const clone = require('clone');
const fs = require('fs');
const path = require('path');
const keyPath = require('key-path-helpers');

const DeepExtend = require('deep-extend');
const EventEmitter = require('events')

const app = electron.app || electron.remote.app;
const kUserDataPath = app.getPath('userData');

module.exports =
class Config extends EventEmitter {

    constructor(name, debounceTimeMs = 100){
        super();

        assert.strictEqual(typeof name, 'string', "Name must be a string.");
        assert.strictEqual(typeof debounceTimeMs, 'number', 'DebounceTimeMs must be an integer.');
        assert(debounceTimeMs >= 0, 'DebounceTimeMs must be a positive number or 0.')

        this._settings = null;
        this._defaults = {};

        this._debounceTimeout = null;
        this._debounceTime = debounceTimeMs;

        this._path = path.join(kUserDataPath, name);
    }

    _flushSettings(settings){

      const tempPath = `${this._path}-tmp`;
      const finalPath = this._path;

      debug('Flushing settings to file.');

      return new Promise((resolve, reject) => {

        // stringify settings object.
        const settingsJson = JSON.stringify(settings, null, 2);

        // Write to temporary settings file.
        fs.writeFile(tempPath, settingsJson, (err) => {
          if(!err){

            // Overwrite actual settings file with temporary file.
            fs.rename(tempPath, finalPath, (err) => {
              if(!err){
                debug('Settings flushed successfully.');
                resolve();
              }
              else {
                debug('Could not commit settings to file.');
                reject();
              }
            }); // fs.rename

          }
          else {
            debug('Could not write settings to temporary file.');
            fs.unlink(tempPath, () => {
              reject();
            });
          }
        }); // fs.writeFile

      });
    }

    _writeSettings(settings, options){
      // Clear any existing commit timeout.
      clearTimeout(this._debounceTimeout);

      // If debounced, instantly resolve the promise, and set a timeout to
      // commit the settings.
      if(options.debounce){

        this._debounceTimeout = setTimeout(this._debounceTime, () => {
          this._flushSettings(settings);
        });

        return Promise.resolve();
      }
      // If not debounced, return the write promise.
      else {
        return this._flushSettings(settings);
      }
    }

    _readSettings(path){
        debug(`Reading settings from ${path}...`);

        return new Promise((resolve, reject) => {

            fs.readFile(path, (err, data) => {
                if(!err){
                    this._settings = JSON.parse(data);
                    debug('Read settings file successfully.');
                    resolve();
                }
                else if(err.code == 'ENOENT'){
                    debug('Settings file does not exist. Using defaults.');

                    const settings = clone(this._defaults);
                    this._settings = settings;
                    this._flushSettings(settings).then(resolve, reject);
                }
                else {
                    debug(`Failed to read settings file with ${err.code}. Using defaults.`);
                    reject();
                }
            });
        });
    }

    _ensureSettings(){
        return new Promise((resolve, reject) => {
            if(this._settings){
                resolve(this._settings);
            }
            else {
                this._readSettings(this._path).then(() => {
                    resolve(this._settings);
                }, reject);
            }
        });
    }

    defaults(defaults){
        assert.strictEqual(typeof defaults, 'object', 'Defaults must be an object.');
        this._defaults = clone(defaults);
    }

    extendDefaults(defaults, options = {}){
      assert.strictEqual(typeof defaults, 'object', 'Defaults must be an object.');
      assert.strictEqual(typeof options, 'object', 'Options must be an object.');

      return new Promise((resolve, reject) => {
        this._ensureSettings().then((settings) => {
          DeepExtend(settings, defaults);
          this._writeSettings(settings, options).then(resolve, reject);
        });
      });
    }

    has(key){
      asset.strictEqual(typeof key, 'string', 'Key must be a string.')

      debug(`Checking if "${key}" exists.`);

      return new Promise((resolve, reject) => {
        this._ensureSettings().then((settings) => {
          resolve(keyPath.hasKeyPath(settings, key));
        }, reject);
      });
    }

    get(key){
      assert.strictEqual(typeof key, 'string', 'Key must be a string.');

      debug(`Getting "${key}".`)

      return new Promise((resolve, reject) => {
        this._ensureSettings().then((settings) => {

          const value = keyPath.getValueAtKeyPath(settings, key);
          resolve(value);

        }, reject);
      });
    }

    set(key, value = {}, options = {}){
      assert.strictEqual(typeof key, 'string', 'Key path must be a string.');
      assert.strictEqual(typeof options, 'object', 'Options must be an object.');

      debug(`Setting "${key}".`);

      return new Promise((resolve, reject) => {
        this._ensureSettings().then((settings) => {
          keyPath.setValueAtKeyPath(settings, key, value);
          this._writeSettings(settings, options).then(resolve, reject);
        }, reject);

      });
    }

    observe(key, cb){

    }

}
