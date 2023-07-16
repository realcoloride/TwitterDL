// ==UserScript==
// @name         Twitter DL - Click "Always Allow"!
// @version      1.0.6
// @description  Download twitter videos directly from your browser! (CLICK "ALWAYS ALLOW" IF PROMPTED!)
// @author       realcoloride
// @license      MIT
// @namespace    https://twitter.com/*
// @match        https://twitter.com/*
// @connect      twitterpicker.com
// @connect      twimg.com
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @grant        GM.xmlHttpRequest
// ==/UserScript==

(function() {
    let injectedTweets = [];
    const checkFrequency = 150; // in milliseconds
    const apiEndpoint = "https://api.twitterpicker.com/tweet/mediav2?id=";
    const downloadText = "Download"

    const style = 
    `.dl-video {
        padding: 6px;
        padding-left: 5px;
        padding-right: 5px;
        margin-left: 5px;
        margin-bottom: 2px;
        border-color: black;
        border-style: none;
        border-radius: 10px;
        color: white;

        background-color: rgba(39, 39, 39, 0.46);
        font-family: Arial, Helvetica, sans-serif;
        font-size: xx-small;

        cursor: pointer;
    }

    .dl-hq {
        background-color: rgba(28, 199, 241, 0.46);
    }
    .dl-lq {
        background-color: rgba(185, 228, 138, 0.46);
    }`;

    // Styles
    function injectStyles() {
        const styleElement = document.createElement("style");
        styleElement.textContent = style;

        document.head.appendChild(styleElement);
    }
    injectStyles();

    // Snippet extraction
    function getRetweetFrame(tweetElement) {
        let retweetFrame = null;
        const candidates = tweetElement.querySelectorAll(`[id^="id__"]`);

        candidates.forEach((candidate) => {
            const candidateFrame = candidate.querySelector('div[tabindex="0"][role="link"]');

            if (candidateFrame)
                retweetFrame = candidateFrame;
        });

        return retweetFrame;
    }
    function getTopBar(tweetElement, isRetweet) {
        // I know its kind of bad but it works

        let element = tweetElement;

        if (isRetweet) {
            const retweetFrame = getRetweetFrame(tweetElement);
            const videoPlayer = tweetElement.querySelector('[data-testid="videoPlayer"]');
            const videoPlayerOnRetweet = retweetFrame.querySelector('[data-testid="videoPlayer"]')

            const isVideoOnRetweet = (videoPlayer == videoPlayerOnRetweet);
            
            if (videoPlayerOnRetweet && isVideoOnRetweet) element = retweetFrame;
            else if (videoPlayerOnRetweet == null) element = tweetElement;
        }

        const userName = element.querySelector('[data-testid="User-Name"]');
        
        if (isRetweet && element != tweetElement) return userName.parentNode.parentNode;
        return userName.parentNode.parentNode.parentNode;
    }

    // Fetching
    async function getMediasFromTweetId(id) {
        const url = `${apiEndpoint}${id}`;

        const request = await GM.xmlHttpRequest({
            method: "GET",
            url: url
        });
        const result  = JSON.parse(request.responseText);
        
        let foundMedias = [];
        const medias = result.media;

        if (medias) {
            const videos = medias.videos;

            if (videos.length > 0) {
                for (let i = 0; i < videos.length; i++) {
                    const video = videos[i];
                    const variants = video.variants;
                    if (!variants || variants.length == 0) continue;

                    // Check variant medias
                    let videoContestants = {};

                    variants.forEach((variant) => {
                        const isVideo = (variant.content_type.startsWith("video"));

                        if (isVideo) {
                            const bitrate = variant.bitrate;
                            const url = variant.url;
                            videoContestants[url] = bitrate;
                        };
                    })

                    // Sort by lowest to highest bitrate
                    const sortedContestants = Object.values(videoContestants).sort((a, b) => a - b);
                    const findContestant = (value) => {
                        const entry = Object.entries(videoContestants).find(([key, val]) => val === value);
                        return entry ? entry[0] : null;
                    };                  

                    let lowQualityVideo = null;
                    let highQualityVideo = null;

                    for (let k = 0; k < sortedContestants.length; k++) {
                        const bitrate = sortedContestants[k];
                        const url = findContestant(bitrate);

                        if (url) {
                            lowQualityVideo = findContestant(sortedContestants[0]);

                            if (sortedContestants.length > 1) // If has atleast 2 entries
                                highQualityVideo = findContestant(sortedContestants[sortedContestants.length - 1]);
                        }
                    }

                    const meta = result.meta;

                    let mediaInformation = {
                        "hq" : highQualityVideo,
                        "lq" : lowQualityVideo,
                        "metadata" : meta
                    }
                    foundMedias.push(mediaInformation);
                }
            }
        }

        return foundMedias;
    }

    // Downloading
    async function downloadFile(button, url, mode, filename) {
        const baseText = `${downloadText} (${mode.toUpperCase()})`;
        
        button.disabled = true;
        button.innerText = "Downloading...";
    
        console.log(`[TwitterDL] Downloading Tweet URL (${mode.toUpperCase()}): ${url}`);
        
        function finish() {
            if (button.innerText == baseText) return;

            button.disabled = false;
            button.innerText = baseText;
        }

        GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            onload: function(response) {
                const blob = response.response;
                const link = document.createElement('a');

                link.href = URL.createObjectURL(blob);
                link.setAttribute('download', filename);
                link.click();

                URL.revokeObjectURL(link.href);
                button.innerText = 'Downloaded!';
                button.disabled = false;

                setTimeout(finish, 1000);
            },
            onerror: function(error) {
                console.error('[TwitterDL] Download Error:', error);
                button.innerText = 'Download Failed';
                
                setTimeout(finish, 1000);
            },
            onprogress: function(progressEvent) {
                if (progressEvent.lengthComputable) {
                    const percentComplete = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                    button.innerText = `Downloading: ${percentComplete}%`;
                } else
                    button.innerText = 'Downloading...';
            }
        });
    }
    function createDownloadButton(tweetId, tag) {
        const button = document.createElement("button");
        button.hidden = true;

        getMediasFromTweetId(tweetId).then((mediaInformation) => {
            const video = mediaInformation[0];
            if (!video) return;
            
            const url = video[tag];
            const metadata = video.metadata;
            const username = metadata.username;
            const filename = `TwitterDL_${username}_${tweetId}`;

            button.classList.add("dl-video", `dl-${tag}`);
            button.innerText = `${downloadText} (${tag.toUpperCase()})`;
            button.setAttribute("href", url);
            button.setAttribute("download", "");
            button.addEventListener('click', async() => {
                await downloadFile(button, url, tag, filename);
            });

            button.hidden = false;
        });

        return button;
    }
    function createDownloadButtons(tweetElement) {
        const tweetInformation = getTweetInformation(tweetElement);
        if (!tweetInformation) return;
        
        const tweetId = tweetInformation.id;
        getMediasFromTweetId(tweetId).then((mediaInformation) => {
            const video = mediaInformation[0];
            if (!video) return;

            const retweetFrame = getRetweetFrame(tweetElement);
            const isRetweet = (retweetFrame != null);

            let lowQualityButton;
            let highQualityButton;
            if (video["lq"])  lowQualityButton = createDownloadButton(tweetId, "lq");
            if (video["hq"]) highQualityButton = createDownloadButton(tweetId, "hq");
            
            const videoPlayer = isRetweet ? tweetElement.querySelector('[data-testid="videoPlayer"]') : null;
            const videoPlayerOnRetweet = isRetweet ? retweetFrame.querySelector('[data-testid="videoPlayer"]') : null;

            const topBar = getTopBar(tweetElement, isRetweet);
            const threeDotsElement = topBar.lastChild

            const isVideoOnRetweet = (videoPlayer == videoPlayerOnRetweet);
    
            if (!lowQualityButton && !highQualityButton) return;

            // Order: HQ then LQ
            if (videoPlayer != null && isRetweet && isVideoOnRetweet) {
                // Add a little side dot
                addSideTextToRetweet(tweetElement, " · ", 6, 5);

                if (highQualityButton) topBar.appendChild(highQualityButton);
                if (lowQualityButton)  topBar.appendChild(lowQualityButton);
            } else {
                if (lowQualityButton)  topBar.insertBefore(lowQualityButton, threeDotsElement);
                if (highQualityButton) topBar.insertBefore(highQualityButton, lowQualityButton);
            }
        })
    }
    function addSideTextToRetweet(tweetElement, text, forcedMargin, forcedWidth) {
        const timeElement = tweetElement.querySelector("time");
        const computedStyles = window.getComputedStyle(timeElement);

        // Make a new text based on the font and color
        const textElement = timeElement.cloneNode(true);
        textElement.innerText = text;
        textElement.setAttribute("datetime", "");

        for (const property of computedStyles) {
            textElement.style[property] = computedStyles.getPropertyValue(property);
        }

        textElement.style.overflow = "visible";
        textElement.style["padding-left"] = "4px";
        textElement.style["margin-left"] = forcedMargin || 0;

        const tweetAvatarElement = tweetElement.querySelectorAll('[data-testid="Tweet-User-Avatar"]')[1];
        const targetTweetBar = tweetAvatarElement.parentNode;

        targetTweetBar.appendChild(textElement);

        const contentWidth = textElement.scrollWidth;
        textElement.style.width = (forcedWidth || contentWidth) + 'px';
        
        injectedFallbacks.push(tweetElement);
    }

    // Page information gathering
    function getTweetsInPage() {
        return document.getElementsByTagName("article");
    }
    let injectedFallbacks = [];
    function getTweetInformation(tweetElement) {
        let information = {};

        // ID
        // Check the tweet timestamp, it has a link with the id at the end
        // In case something goes wrong, a fallback text is shown
        let id = null;

        const retweetFrame = getRetweetFrame(tweetElement);
        const isRetweet = (retweetFrame != null);
        
        const videoPlayer = isRetweet ? retweetFrame.querySelector('[data-testid="videoPlayer"]') : null;

        const isPost = (isStatusUrl(window.location.href));

        try {
            if (isRetweet && isPost) {
                const hasRetweetVideoPlayer = (videoPlayer != null);
                if (hasRetweetVideoPlayer)
                    id = (window.location.href).split("/").pop();
            } else {
                const timeElement = tweetElement.querySelector("time");
                const timeHref = timeElement.parentNode;
                const tweetUrl = timeHref.href;
                id = tweetUrl.split("/").pop();
            }
        } catch (error) {
            try {
                if (injectedFallbacks.includes(tweetElement)) return;

                const retweetFrame = getRetweetFrame(tweetElement);
                const videoPlayer = retweetFrame.querySelector('[data-testid="videoPlayer"]');
                
                if (!videoPlayer != null && retweetFrame != null && isStatusUrl(window.location.href)) return;
                console.log("[TwitterDL] Twitter quote retweets from statuses are not supported yet. Throwing fallback");

                addSideTextToRetweet(tweetElement, " · Open to Download");
            } catch (error) {}
        }

        if (!id) return;
        information.id = id;

        // VideoPlayer element
        const videoPlayerElement = tweetElement.querySelector('[data-testid="videoPlayer"]');
        information.videoPlayer = videoPlayerElement;

        // Play button
        return information;
    }

    // Page injection
    async function injectAll() {
        const tweets = getTweetsInPage();
        for (let i = 0; i < tweets.length; i++) {
            const tweet = tweets[i];
            const alreadyInjected = injectedTweets.includes(tweet);

            if (!alreadyInjected) {
                const videoPlayer = tweet.querySelector('[data-testid="videoPlayer"]');
                const isVideo = (videoPlayer != null);
                
                if (!isVideo) continue;

                createDownloadButtons(tweet);
                injectedTweets.push(tweet);
            }
        }
    }
    function checkForInjection() {
        const tweets = getTweetsInPage();
        const shouldInject = (injectedTweets.length != tweets.length);

        if (shouldInject) injectAll();
    }

    function isStatusUrl(url) {
        const statusUrlRegex = /^https?:\/\/twitter\.com\/\w+\/status\/\d+$/;
        return statusUrlRegex.test(url);
    }
    function isValidUrl(url) {
        const tweetUrlRegex = /^https?:\/\/twitter\.com\/\w+(\/\w+)*$/        ;
        return tweetUrlRegex.test(url) || isStatusUrl(window.location.href);
    }      
    if (isValidUrl(window.location.href)) {
        console.log("[TwitterDL] by (real)coloride - 2023 // Loading... ");

        setInterval(async() => {
            try {
                checkForInjection();
            } catch (error) {
                console.error("[TwitterDL] Fatal error: ", error);
            }
        }, checkFrequency);
    }
})();
