module Fabrique {
    export module AdProvider {
        export interface ICustomParams {
            [name: string]: string | number| any[];
        }

        export class Ima3 implements IProvider {
            private gameContent: any;

            private adContent: HTMLElement;

            private adDisplay: GoogleAds.ima.AdDisplayContainer;

            private adLoader: GoogleAds.ima.AdsLoader;

            private adsManager: GoogleAds.ima.AdsManager = null;

            private googleEnabled: boolean = false;

            private canPlayAds: boolean = false;

            private adTagUrl: string = '';

            private game: Phaser.Game;

            private adRequested: boolean = false;

            public adManager: AdManager = null;

            private fauxVideoElement: HTMLMediaElement;

            private gameOverlay: HTMLElement;

            constructor(game: Phaser.Game, adTagUrl: string) {
                if (typeof google === "undefined") {
                    return;
                }

                this.googleEnabled = true;

                this.gameContent = (typeof game.parent === 'string') ? document.getElementById(<string>(<any>game).parent) : game.parent;
                // this.gameContent.currentTime = 100;
                this.gameContent.style.position = 'absolute';
                this.gameContent.style.width = '100%';
                this.gameContent.style.height = '100%';

                this.adContent = this.gameContent.parentNode.appendChild(document.createElement('div'));
                this.adContent.id = 'phaser-ad-container';
                this.adContent.style.position = 'absolute';
                this.adContent.style.zIndex = '9999';
                this.adContent.style.display = 'none';


                //This is a work around for some ios failing issues
                //iOS ima3 requires this information, but canvas doesn't provide it. so we create a a custom method
                if (game.device.iOS) {
                    this.fauxVideoElement = this.gameContent.parentNode.appendChild(document.createElement('video'));
                    this.fauxVideoElement.id = 'phaser-ad-faux-video';
                    this.fauxVideoElement.style.position = 'absolute';
                    this.fauxVideoElement.style.zIndex = '999';
                    this.fauxVideoElement.style.display = 'none';

                    this.gameOverlay = this.gameContent.parentNode.appendChild(document.createElement('div'));
                    this.gameOverlay.id = 'phaser-ad-game-overlay';
                    this.gameOverlay.style.backgroundColor = '#000000';
                    this.gameOverlay.style.position = 'absolute';
                    this.gameOverlay.style.zIndex = '99';
                    this.gameOverlay.style.display = 'none';


                    (<any>this.gameContent).canPlayType = (): string => {
                        return this.fauxVideoElement.canPlayType('video/mp4');
                    };
                    (<any>this.gameContent).load = (): void => {console.log('loading video')};
                    (<any>this.gameContent).pause = (): void => {console.log('pausing video')};
                    (<any>this.gameContent).play = (): void => {console.log('playing video')};
                }

                this.adTagUrl = adTagUrl;
                this.game = game;

                // Create the ad display container.
                this.adDisplay = new google.ima.AdDisplayContainer(this.adContent, (game.device.iOS) ? this.fauxVideoElement : this.gameContent);

                //Set vpaid enabled, and update locale
                (<any>google.ima.settings).setVpaidMode((<any>google.ima).ImaSdkSettings.VpaidMode.ENABLED);
                (<any>google.ima.settings).setLocale('nl');

                // Create ads loader, and register events
                this.adLoader = new google.ima.AdsLoader(this.adDisplay);
                this.adLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, this.onAdManagerLoader, false, this);
                this.adLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, this.onAdError.bind(this), false);
            }

            public setManager(manager: AdManager): void {
                this.adManager = manager;
            }

            /**
             * Doing an ad request, if anything is wrong with the lib (missing ima3, failed request) we just dispatch the contentResumed event
             * Otherwise we display an ad
             */
            public requestAd(customParams?: ICustomParams): void {
                if (!this.googleEnabled) {
                    this.adManager.onContentResumed.dispatch();
                    return;
                }

                //For mobile this ad request needs to be handled post user click
                this.adDisplay.initialize();

                // Request video ads.
                var adsRequest = new google.ima.AdsRequest();
                adsRequest.adTagUrl = this.adTagUrl + this.parseCustomParams(customParams);

                let width: number = parseInt(<string>(!this.game.canvas.style.width ? this.game.canvas.width : this.game.canvas.style.width), 10);
                let height: number = parseInt(<string>(!this.game.canvas.style.height ? this.game.canvas.height : this.game.canvas.style.height), 10);

                // Specify the linear and nonlinear slot sizes. This helps the SDK to
                // select the correct creative if multiple are returned.
                adsRequest.linearAdSlotWidth = width;
                adsRequest.linearAdSlotHeight = height;
                adsRequest.nonLinearAdSlotWidth = width;
                adsRequest.nonLinearAdSlotHeight = height / 3;

                if (this.game.device.iOS) {
                    this.fauxVideoElement.style.width = width + 'px';
                    this.fauxVideoElement.style.height = height + 'px';
                    this.gameOverlay.style.width = width + 'px';
                    this.gameOverlay.style.height = height + 'px';
                }


                //Required for games, see:
                //http://googleadsdeveloper.blogspot.nl/2015/10/important-changes-for-gaming-publishers.html
                adsRequest.forceNonLinearFullSlot = true;

                try {
                    this.adLoader.requestAds(adsRequest);
                } catch (e) {
                    console.log(e);
                    this.adManager.onContentResumed.dispatch();
                }
            }

            /**
             * Called when the ads manager was loaded.
             * We register all ad related events here, and initialize the manager with the game width/height
             *
             * @param adsManagerLoadedEvent
             */
            private onAdManagerLoader(adsManagerLoadedEvent: GoogleAds.ima.AdsManagerLoadedEvent): void {
                // Get the ads manager.
                var adsRenderingSettings = new google.ima.AdsRenderingSettings();
                adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;


                // videoContent should be set to the content video element.
                this.adsManager = adsManagerLoadedEvent.getAdsManager(this.gameContent, adsRenderingSettings);

                // Add listeners to the required events.
                this.adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, this.onAdError.bind(this));
                this.adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, this.onContentPauseRequested.bind(this));
                this.adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, this.onContentResumeRequested.bind(this));
                this.adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, this.onAdEvent.bind(this));

                // Listen to any additional events, if necessary.
                this.adsManager.addEventListener(google.ima.AdEvent.Type.LOADED, this.onAdEvent.bind(this));
                this.adsManager.addEventListener(google.ima.AdEvent.Type.STARTED, this.onAdEvent.bind(this));
                this.adsManager.addEventListener(google.ima.AdEvent.Type.COMPLETE, this.onAdEvent.bind(this));

                try {
                    this.adContent.style.display = 'block';
                    if (this.game.device.iOS) {
                        this.fauxVideoElement.style.display = 'block';
                        this.gameOverlay.style.display = 'block';
                    }
                    // Initialize the ads manager. Ad rules playlist will start at this time.

                    let width: number = parseInt(<string>(!this.game.canvas.style.width ? this.game.canvas.width : this.game.canvas.style.width), 10);
                    let height: number = parseInt(<string>(!this.game.canvas.style.height ? this.game.canvas.height : this.game.canvas.style.height), 10);

                    this.adsManager.init(width, height, google.ima.ViewMode.NORMAL);
                    // Call play to start showing the ad. Single video and overlay ads will
                    // start at this time; the call will be ignored for ad rules.
                    this.adsManager.start();
                } catch (adError) {
                    this.onAdError();
                }
            }

            /**
             * Generic ad events are handled here
             * @param adEvent
             */
            private onAdEvent(adEvent: any) {
                console.log('onAdEvent', arguments);

                if (adEvent.type == google.ima.AdEvent.Type.CLICK) {
                    this.adManager.onAdClicked.dispatch();
                } else if (adEvent.type == google.ima.AdEvent.Type.LOADED) {
                    var ad = adEvent.getAd();
                    console.log(ad);
                    if (!ad.isLinear())
                    {
                        this.onContentResumeRequested();
                    }
                } else if (adEvent.type === google.ima.AdEvent.Type.ALL_ADS_COMPLETED) {
                    this.onContentResumeRequested();
                }
            }

            private onAdError() {
                console.log('gneric ad error');
                if (null !== this.adsManager) {
                    this.adsManager.destroy();
                    this.adsManager = null;
                }

                //We silently ignore adLoader errors, it just means there is no ad available
                this.onContentResumeRequested()
            }

            /**
             * When the ad starts playing, and the game should be paused
             */
            private onContentPauseRequested() {
                console.log('onContentPauseRequested', arguments);
                this.adManager.onContentPaused.dispatch();
            }

            /**
             * When the ad is finished and the game should be resumed
             */
            private onContentResumeRequested() {
                console.log('onContentResumeRequested', arguments);
                this.adContent.style.display = 'none';
                if (this.game.device.iOS) {
                    this.fauxVideoElement.style.display = 'none';
                    this.gameOverlay.style.display = 'none';
                }
                this.adManager.onContentResumed.dispatch();
            }

            private parseCustomParams(customParams: ICustomParams): string {
                if (undefined !== customParams) {
                    let customDataString: string = '';
                    for (let key in customParams) {
                        if (customDataString.length > 0) {
                            customDataString += '' +
                                '&';
                        }
                        var param = (Array.isArray(customParams[key])) ? (<any[]>customParams[key]).join(',') : customParams[key];
                        customDataString += key + '=' + param;
                    }
                    return '&cust_params=' + encodeURIComponent(customDataString);
                }

                return '';
            }
        }
    }
}