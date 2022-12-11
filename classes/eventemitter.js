class EventListener {
    /**
     * @type {Map<symbol, Function[]>}
     * Map of event names to an array of event handlers
     * @memberof EventListener
     * @protected
     */
    _eventHandlers = new Map();

    /**
     * @param {symbol} eventName
     * @param {Function} eventHandler
     * @returns {void}
     * Adds an event handler for the given event name
     * @public
     * @memberof EventListener
     */
    on(eventName, eventHandler) {
        if (!this._eventHandlers.has(eventName)) {
            this._eventHandlers.set(eventName, []);
        }

        this._eventHandlers.get(eventName).push(eventHandler);
    }

    /**
     * @param {symbol} eventName
     * @param {Function} eventHandler
     * @returns {void}
     * Removes an event handler for the given event name
     * @public
     * @memberof EventListener
     * 
     * @throws {Error} if the event handler is not found
     * @throws {Error} if the event name is not found
     * @throws {Error} if the event name is not a symbol
     * @throws {Error} if the event handler is not a function
     * @throws {Error} if the event name is empty
     */
    off(eventName, eventHandler) {
        if (typeof eventName !== 'symbol') {
            throw new Error('eventName must be a symbol');
        }

        if (eventName.length === 0) {
            throw new Error('eventName must not be empty');
        }

        if (typeof eventHandler !== 'function') {
            throw new Error('eventHandler must be a function');
        }

        if (!this._eventHandlers.has(eventName)) {
            throw new Error(`Event name ${eventName} not found`);
        }

        const eventHandlers = this._eventHandlers.get(eventName);
        const eventHandlerIndex = eventHandlers.indexOf(eventHandler);

        if (eventHandlerIndex === -1) {
            throw new Error(`Event handler not found for event name ${eventName}`);
        }

        eventHandlers.splice(eventHandlerIndex, 1);
    }
}

class EventEmitter extends EventEmitter {
    /**
     * @param {string} eventName
     * @param {any} eventArgs
     * @returns {void}
     * Emits an event with the given event name and event arguments
     * @public
     * @memberof EventEmitter
     */
    emit(eventName, eventArgs) {
        if (this._eventHandlers.has(eventName)) {
            this._eventHandlers.get(eventName).forEach(eventHandler => eventHandler(eventArgs));
        }
    }

    /**
     * @returns {EventListener}
     * @public
     * @memberof EventEmitter
     * @returns {EventListener} event listener for the event emitter
     */
    getEventListener() {
        return this;
    }

    /**
     * @returns {void}
     * Removes all event handlers
     * @public
     * @memberof EventEmitter
     */
    removeAllEventHandlers() {
        this._eventHandlers.clear();
    }

    /**
     * @returns {void}
     * Removes all event handlers for the given event name
     * @public
     * @memberof EventEmitter
     */
    removeAllEventHandlersForEventName(eventName) {
        this._eventHandlers.delete(eventName);
    }
}