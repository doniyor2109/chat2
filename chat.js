/*
 {devtools}
 chat.sendContentRaw({action: "getData"}, function(message){
 console.log(message.result);
 });
 ///
 {content}
 chat.onDevtools(function(message, response){
 if(message.action == "getData"){
 response({result: "OK"});
 }
 });
 chat.on("getData", function(message, response){
 response({result: "OK"});
 });

 * */
//TODO add event functionality emit, on, broadcast .etc
//TODO add promise
//TODO if content page is not loaded and if devtools wants to send message push it to queue to prevent smooth message flow

/*
* internal events :
* $devtoolsConnected
* $devtoolsDisconnected
* $contentLoaded
* */
(function (root) {
    function Script() {
        this.lastMessage = null;
        this.events = {};
        this.callbacks = {};
        this.backgroundHandler= function (message) {
            console.log(message);
        };
        this.devtoolsHandler = function (message) {
            console.log(message);

        };
        this.contentHandler= function (message) {
            console.log(message);
        };
        this.preInit();
        this.init();
        this.postInit();
    }
    Script.prototype = {
        preInit: function () {

        },
        postInit: function () {

        },
        init: function () {
          this.listenBackground();
          this.listenContent();
          this.listenDevtools();
          return this;
        },
        handleRequest: function (data, handler) {
            if(data.event){
                this.triggerEvent(data);
            } else if(data.callback && data.arguments !== false){
                this.executeCallback(data);
            } else if((response = handler.call(this, data.message)) && data.callback){
                this.resendCallback(data, response);
            }
        },
        registerBackgroundReciever: function(fn){
            this.backgroundHandler = fn;
        },
        triggerEvent: function (data) {
            if(data.event in this.events ){
                this.resendCallback(data, this.events[data.event].call(this, data.arguments));
            }
        },
        registerContentReciever: function(fn){
            this.backgroundHandler = fn;
        },
        registerDevtoolsReciever: function(fn){
            this.backgroundHandler = fn;
        },
        executeCallback: function (data) {
            this.callbacks[data.callback].call(this, data.arguments);
            delete this.callbacks[data.callback];
        },
        resendCallback: function (data, response) {
            data = {
                to: data.from,
                from: scriptType,
                arguments: response,
                callback: data.callback
            };
            this.sendRaw(data);
        },
        listenBackground: function () {},
        listenContent: function () {},
        listenDevtools: function () {},
        sendContent: function (message, fn) {
            this.send(SCRIPTS.CONTENT, message, fn);
        },
        sendDevtools: function (message, fn) {
            this.send(SCRIPTS.DEVTOOLS, message, fn);
        },
        sendBackground: function (message, fn) {
            this.send(SCRIPTS.BACKGROUND, message, fn);
        },
        generateCallbackName: function () {
            return "callback_" + Date.now().toString();
        },
        generateDevtoolsConnectionName: function () {
            return "devtools_connection_" + Date.now().toString();
        },
        send: function (to, message, fn) {
            var callbackName = undefined;
            if(fn){
                callbackName = this.generateCallbackName();
                this.callbacks[callbackName] = fn;
            }
            this.sendRaw({
                to: to,
                message: message || {},
                from: scriptType,
                callback: callbackName
            }, fn);
        },
        sendEvent: function (event, args, fn) {
            var callbackName = undefined;
            if(fn){
                callbackName = this.generateCallbackName();
                this.callbacks[callbackName] = fn;
            }
            for(let script in SCRIPTS){
                this.sendRaw({
                    to: SCRIPTS[script],
                    event: event,
                    arguments: args,
                    from: scriptType,
                    callback: callbackName
                });
            }
        },
        sendRaw: function (data) {
            if(data.to == scriptType){
                return;
            }
            switch (data.to){
                case SCRIPTS.BACKGROUND:
                    this.sendBackgroundRaw(data);
                    break;
                case SCRIPTS.CONTENT:
                    this.sendContentRaw(data);
                    break;
                case SCRIPTS.DEVTOOLS:
                    this.sendDevtoolsRaw(data);
                    break;
                default:
                    throw "Specify 'to' parametr";
            }
        },
        on: function (event, handler) {
            this.events[event] = handler;
        },
        off: function (event) {
            delete this.events[event];
        },
        emit: function (event, param1, param2) {
            var args = null, handle;
            if(typeof param1 == "function"){
                handle = param1;
            } else {
                handle = param2;
                args = param1;
            }
            this.sendEvent(event, args, handle);
        }
    };

    function BackgroundScript(){
        this.devtoolsConnections = [];

    }
    BackgroundScript.prototype = new Script();

    BackgroundScript.prototype.listenContent = function () {
        //listening content
        /*
        * Since Chrome 26
        * */
        chrome.runtime.onMessage.addListener(function (data, sender) {
            switch (data.to) {
                case SCRIPTS.BACKGROUND:
                    this.handleRequest(data, this.backgroundHandler);
                    break;
                default :
                    //redirect
                    data.tabId = sender.tab.id;
                    this.sendRaw(data);
            }
            }.bind(this)
        );
    };
    BackgroundScript.prototype.listenDevtools = function () {
        //init connection between devtools
        /*
         * Since Chrome 26
         * */
        chrome.runtime.onConnect.addListener(function (devToolsConnection) {
            this.emit("$devtoolsConnected", devToolsConnection);
            this.on("setDevtoolTabId", function(tabid){
                this.devtoolsConnections[tabid] = devToolsConnection;
                this.off("setDevtoolTabId");
            }.bind(this));
            devToolsConnection.onDisconnect.addListener(function (port) {
                this.emit("$devtoolsDisconnected", port);
                delete this.devtoolsConnections[this.devtoolsConnections.findIndex((c) => c && c.name === port.name)];
            }.bind(this));

            //listening devtools
            devToolsConnection.onMessage.addListener(function (data) {
                switch (data.to) {
                    case SCRIPTS.BACKGROUND:
                        this.handleRequest(data, this.backgroundHandler);
                        break;
                    default:
                        //redirect
                        this.sendRaw(data);
                }
            }.bind(this));
        }.bind(this));
    };
    BackgroundScript.prototype.sendContentRaw = function (data) {
        function send(tabid){
            chrome.tabs.sendMessage(tabid, data);
        }
        if (!data.tabId) {
            chrome.tabs.query({/* currentWindow:true,*/active: true}, function (tabs) {
                send(tabs[0].id);
            });
        } else {
            send(data.tabId);
        }
    };
    BackgroundScript.prototype.sendDevtoolsRaw = function (data) {
        function send(tabid){
            /*
             * Since Chrome 52
             * */
            if(tabid in this.devtoolsConnections){
                this.devtoolsConnections[tabid].postMessage(data);
            } else {
                console.log('cannot connect to devtools page');
            }
        }
        //to devtools
        data.tabId ? send.call(this, data.tabId) :
            chrome.tabs.query({/*currentWindow: true,*/ active: true}, function (tabs) {
                send.call(this, tabs[0].id);
            }.bind(this));
    };
    BackgroundScript.prototype.postInit = function () {
        this.emit("$backgroundLoaded");
    };

    function DevtoolsScript(){

    }
    DevtoolsScript.prototype = new Script();
    DevtoolsScript.prototype.listenBackground = function () {
        //init connection between background
        this.backgroundConnection = chrome.runtime.connect({name: this.generateDevtoolsConnectionName()});
        //listening background
        this.backgroundConnection.onMessage.addListener(function (data) {
            switch (data.from){
                case SCRIPTS.CONTENT:
                    this.handleRequest(data, this.contentHandler);
                    break;
                case SCRIPTS.BACKGROUND:
                    this.handleRequest(data, this.backgroundHandler);
                break;
            }
        }.bind(this));
        this.emit("setDevtoolTabId", chrome.devtools.inspectedWindow.tabId, function () {});
    };
    DevtoolsScript.prototype.sendBackgroundRaw = function (data) {
        data.tabId = chrome.devtools.inspectedWindow.tabId;
        this.backgroundConnection.postMessage(data);
    };
    DevtoolsScript.prototype.sendContentRaw = function (data, fn) {
        this.sendBackgroundRaw(data);
    };
    DevtoolsScript.prototype.postInit = function () {
        this.emit("$devtoolsLoaded");
    };

    function ContentScript(){

    }
    ContentScript.prototype = new Script;
    ContentScript.prototype.listenBackground = function () {
        //listening background
        chrome.runtime.onMessage.addListener(function (data, sender, sendResponse) {
            switch (data.from){
                case SCRIPTS.DEVTOOLS:
                    this.handleRequest(data, this.devtoolsHandler);
                    break;
                case SCRIPTS.BACKGROUND:
                        this.handleRequest(data, this.backgroundHandler);
                    break;
            }
        }.bind(this));
    };
    ContentScript.prototype.sendBackgroundRaw = function (data, fn) {
        //to background
        //noinspection JSUnresolvedVariable
        chrome.runtime.sendMessage(data, fn);
    };
    ContentScript.prototype.postInit = function () {
        this.emit("$contentLoaded");
    };
    ContentScript.prototype.sendDevtoolsRaw = function (data, fn) {
        this.sendBackgroundRaw(data, fn);
    };
    function detectScript  () {
        // TODO accurate method of detecting
        var script = SCRIPTS.CONTENT;
        //noinspection JSUnresolvedVariable
        if (chrome.tabs) {
            script = SCRIPTS.BACKGROUND;
        } else if (chrome.devtools) {
            script = SCRIPTS.DEVTOOLS;
        }
        return script;
    }
    function getScript(type) {
        switch (type){
            case SCRIPTS.BACKGROUND:
                return new BackgroundScript();
            case SCRIPTS.CONTENT:
                return new ContentScript();
            case SCRIPTS.DEVTOOLS:
                return new DevtoolsScript();
        }
    }
    var SCRIPTS = {
            BACKGROUND: 1,
            CONTENT: 2,
            DEVTOOLS: 3
        },
        scriptType = detectScript();

    root.chat = getScript(scriptType).init();
})(window);