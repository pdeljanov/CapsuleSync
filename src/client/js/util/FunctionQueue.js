'use strict';

const assert = require('assert');
const debug = require('debug')('capsule.util.functionqueue');

module.exports =
class FunctionQueue {

    constructor(concurrency = 0){
        assert(typeof concurrency, 'number', 'SimultaneousJobs must be an integer.');
        assert(concurrency >= 0, 'SimultaneousJobs must be an integer greather than or equal to 0.');

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

        this._queue = [];
    }

    _completed(){
        const completedPromise = this._completedPromise;
        const wasCancelled = this._cancelled;
        this._init();

        completedPromise && completedPromise(wasCancelled);
    }

    _cancelled(){
        this._completed();
    }

    _paused(){
        this._pausedPromise && this._pausedPromise();
        this._pausedPromise = null;
    }

    _crank(){

        // Only crank if running or paused.
        if(this._running && !this._paused && !this._cancelled){

            // If there are queued items, attempt to dispatch the functions.
            if(this._queue.length > 0){

                // Dispatch as many functions as possible upto the concurrency limit.
                while((this._queue.length > 0) && (this.concurrency <= 0 || this._inProgress < this.concurrency)){
                    this._inProgress++;

                    // Append the done() callback to the function parameters.
                    let runner = this._queue.shift();
                    runner.params.push(onComplete.bind(this));

                    // Run the function next tick.
                    process.nextTick(function(runner){
                        runner.func.apply(null, runner.params);
                    }, runner);
                }

                //debug(`Running: ${this._inProgress}, Queued: ${this._queue.length}`);

            }
            // Queue is empty when cranked.
            else {
                // If no functions are in-progress, all work is completed.
                if(this._inProgress === 0){
                    this._completed();
                }
            }
        }

        function onComplete(err){
            this._inProgress--;

            // TODO: Handle err.

            if(this._cancelled){
                if(this._inProgress === 0){
                    this._cancelled();
                }
            }
            else if(this._paused){
                if(this._inProgress === 0){
                    this._paused();
                }
            }
            else {
                this._crank();
            }
        }
    }

    enqueue(fn, ...params){
        //debug(fn.name);
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
        this._cancelled = true;
        return Promise.resolve();
    }

    pause(){
        assert(this._running === true, 'Cannot pause if not running.');
        return new Promise((resolve, reject) => {
            if(!this._paused){
                this._paused = true;
                this._pausedPromise = resolve
            }
            else {
                resolve();
            }
        });
    }

    resume(){
        assert(this._running === true, 'Cannot pause if not running.');
        if(this._paused){
            this._paused = false;
            this._crank();
        }
        return Promise.resolve();
    }




}
