'use strict';

const assert = require('assert');
const debug = require('debug')('capsule.util.functionqueue');

module.exports =
class FunctionQueue {

    constructor(concurrency = 0){
        assert(typeof concurrency, 'number', 'Concurrency must be an integer.');
        assert(concurrency >= 0, 'Concurrency must be an integer greather than or equal to 0.');

        this.concurrency = concurrency;

        this._init();
    }

    _init(){
        this._inProgress = 0;
        this._running = false;
        this._paused = false;
        this._cancelled = false;

        this._completedPromise = null;
        this._pausedPromise = null;
        this._cancelledPromise = null;

        this._queue = [];
    }

    _completed(){
        const completedPromise = this._completedPromise;
        const wasCancelled = this._cancelled;
        this._init();

        completedPromise && completedPromise(wasCancelled);
    }

    _didCancel(){
        this._cancelledPromise && this._cancelledPromise();
        this._cancelledPromise = null;
        this._completed();
    }

    _didPause(){
        this._pausedPromise && this._pausedPromise();
        this._pausedPromise = null;
    }

    _onFunctionDone(){
        this._inProgress--;
        this._crank();
    }

    _crank(){

        // If cancelled, do nothing until all in-progress functions have been executed,
        // then complete the cancellation.
        if(this._cancelled){
            if(this._inProgress === 0){
                this._didCancel();
            }
        }
        // If paused, do nothing until all in-progress functions have been executed,
        // then complete the pause.
        else if(this._paused){
            if(this._inProgress === 0){
                this._didPause();
            }
        }
        // Otherwise, if running...
        else if(this._running){

            // If there are queued items, attempt to dispatch the functions.
            if(this._queue.length > 0){

                // Dispatch as many functions as possible upto the concurrency limit.
                while((this._queue.length > 0) && (this.concurrency <= 0 || this._inProgress < this.concurrency)){
                    this._inProgress++;

                    // Append the done() callback to the function parameters.
                    let runner = this._queue.shift();
                    runner.params.push(() => { this._onFunctionDone(); });

                    process.nextTick(r => r.func.apply(null, r.params), runner);
                }

            }
            // Queue is empty when cranked. When all in-progress functions have been executed,
            // then complete the run.
            else {
                if(this._inProgress === 0){
                    this._completed();
                }
            }
        }

    }

    enqueue(fn, ...params){
        this._queue.push({ 'func': fn, 'params': params });
        this._crank();
    }

    run(){
        assert(this._running === false, 'Function queue is already running.');
        return new Promise((resolve, reject) => {
            this._completedPromise = resolve;
            this._running = true;
            this._crank();
        });
    }

    cancel(){
        assert(this._running === true, 'Cannot cancel if not running.');
        return new Promise((resolve, reject) => {
            if(!this._cancelled){
                this._cancelled = true;
                this._cancelledPromise = resolve;
                this._crank();
            }
            else {
                resolve();
            }
        });
    }

    pause(){
        assert(this._running === true, 'Cannot pause if not running.');
        return new Promise((resolve, reject) => {
            if(!this._paused && !this._cancelled){
                this._paused = true;
                this._pausedPromise = resolve;
                this._crank();
            }
            else {
                reject();
            }
        });
    }

    resume(){
        assert(this._running === true, 'Cannot pause if not running.');
        if(this._paused && !this._cancelled){
            this._paused = false;
            this._crank();
            return Promise.resolve();
        }
        else {
            return Promise.reject();
        }
    }

}
