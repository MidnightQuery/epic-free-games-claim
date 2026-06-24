import {oncePerPageRun} from "@/entrypoints/utils/oncePerPageRun.ts";
import {browser} from "wxt/browser";
import {MessageRequest} from "@/entrypoints/types/messageRequest.ts";
import {FreeGame} from "@/entrypoints/types/freeGame.ts";
import {Platforms} from "@/entrypoints/enums/platforms.ts";
import {FreeGamesResponse} from "@/entrypoints/types/freeGamesResponse.ts";
import {setStorageItem} from "@/entrypoints/hooks/useStorage.ts";
import {
    incrementCounter,
    waitForPageLoad,
    wait,
    getRndInteger
} from "@/entrypoints/utils/helpers.ts";

export default defineContentScript({
    matches: ['https://www.gog.com/*'],
    main(_: any) {
        if (!oncePerPageRun('_myGogContentScriptInjected' as keyof Window)) {
            return;
        }
        browser.runtime.onMessage.addListener((request: MessageRequest) => handleMessage(request));

        function handleMessage(request: MessageRequest) {
            if (request.target !== 'content') return;
            if (request.action === 'getFreeGames') {
                void getFreeGamesList();
            } else if (request.action === "claimGames") {
                void claimCurrentFreeGame();
            }
        }

        async function getFreeGamesList() {
            await waitForPageLoad();
            const banner = document.querySelector('#giveaway');
            if (!banner) return;

            const header = banner.querySelector('.giveaway__content-header');
            if (!header) return;

            const text = header.textContent?.trim() || '';
            const match_all = text.match(/Claim (.*) and don't miss the|Success! (.*) was added to/i);
            if (!match_all) return;

            const title = match_all[1] ? match_all[1].trim() : match_all[2].trim();
            const anchor = banner.querySelector('a');
            const href = anchor ? anchor.getAttribute('href') : '';
            const resolveUrl = (u: string) =>
                u ? new URL(u, 'https://www.gog.com').toString() : '';

            const link = href ? resolveUrl(href) : 'https://www.gog.com/giveaway/claim';
            const imgEl = banner.querySelector('img');
            const imgRaw = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '') : '';

            const isLoggedIn = !!document.querySelector('#menuUsername');

            const gamesArr: FreeGame[] = [{
                title,
                platform: Platforms.GOG,
                link: resolveUrl(link),
                img: imgRaw ? resolveUrl(imgRaw) : '/icon/128.png',
                startDate: new Date().toISOString()
            }];

            await setStorageItem("gogGames", gamesArr);

            const freeGamesResponse: FreeGamesResponse = {
                freeGames: gamesArr,
                loggedIn: isLoggedIn
            };

            await browser.runtime.sendMessage({
                target: 'background',
                action: 'claimFreeGames',
                data: freeGamesResponse
            });
        }

        async function claimCurrentFreeGame() {
            await waitForPageLoad();
            await wait(getRndInteger(500, 1000));
            
            if (window.location.href.includes('/giveaway/claim')) {
                const responseText = document.body.textContent || '';
                try {
                    const cleanText = responseText.trim();
                    if (cleanText === '{}') {
                        console.log('GOG Game claimed successfully!');
                        await incrementCounter();
                    } else if (cleanText.includes('message')) {
                        const parsed = JSON.parse(cleanText);
                        if (parsed.message === 'Already claimed') {
                            console.log('GOG Game already claimed.');
                        } else {
                            console.warn('GOG Claim response:', parsed.message);
                        }
                    } else {
                        console.warn('GOG Claim unexpected body:', cleanText);
                    }
                } catch (e) {
                    console.error('Failed to parse claim response:', e);
                }
            } else {
                window.location.href = 'https://www.gog.com/giveaway/claim';
            }
        }
    }
});
