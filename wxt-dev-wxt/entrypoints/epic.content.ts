import {MessageRequest} from "@/entrypoints/types/messageRequest.ts";
import {FreeGame} from "@/entrypoints/types/freeGame.ts";
import { browser } from 'wxt/browser';
import {setStorageItem} from "@/entrypoints/hooks/useStorage.ts";
import { oncePerPageRun } from "@/entrypoints/utils/oncePerPageRun";
import {Platforms} from "@/entrypoints/enums/platforms.ts";
import {FreeGamesResponse} from "@/entrypoints/types/freeGamesResponse.ts";
import {
    getRndInteger,
    wait,
    clickWhenVisibleIframe,
    clickWhenVisible,
    waitForPageLoad,
    incrementCounter
} from "@/entrypoints/utils/helpers.ts";
import {defineContentScript} from "wxt/utils/define-content-script";

export default defineContentScript({
    matches: ['https://store.epicgames.com/*'],
    main(_: any) {
        if (!oncePerPageRun('_myEpicContentScriptInjected')) {
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
            const games = document.querySelector('section.css-2u323');
            const freeGames = games?.querySelectorAll('a.css-g3jcms:has(div.css-82y1uz)') as NodeListOf<HTMLAnchorElement>;
            const isLoggedIn: boolean = (document.querySelector('egs-navigation') as HTMLElement | null)?.getAttribute('isloggedin') === 'true';
            let gamesArr: FreeGame[] = [];
            freeGames?.forEach((freeGame) => {
                const newFreeGame = {
                    link: freeGame.href ?? '',
                    img: freeGame.getElementsByTagName('img')[0]?.dataset.image ?? '',
                    title: freeGame.getElementsByTagName('h6')[0]?.innerHTML ?? '',
                    platform: Platforms.Epic
                };
                gamesArr.push(newFreeGame);
            });
            if (gamesArr.length > 0) {
                const freeGamesResponse: FreeGamesResponse = {
                    freeGames: gamesArr,
                    loggedIn: isLoggedIn
                }
                await setStorageItem("epicGames", gamesArr);
                await browser.runtime.sendMessage({
                    target: 'background',
                    action: 'claimFreeGames',
                    data: freeGamesResponse
                });
            }
        }

        async function claimCurrentFreeGame() {
            await waitForPageLoad();
            await wait(getRndInteger(100, 500));
            await clickWhenVisible('[data-testid="purchase-cta-button"]');
            await wait(getRndInteger(100, 500));
            await tryClickDeviceNotSupportedContinue();
            await clickWhenVisibleIframe('#webPurchaseContainer iframe', 'button.payment-btn.payment-order-confirm__btn');
            await wait(getRndInteger(100, 500));
            await clickWhenVisibleIframe('#webPurchaseContainer iframe', 'button.payment-confirm__btn.payment-btn--primary');
            await incrementCounter();
        }

        async function tryClickDeviceNotSupportedContinue() {
            const modalCtaButtons = document.querySelectorAll(
                'div.css-16r1tk9 div.css-15w5v2y-CTA button[type="button"]'
            );
            const continueButton = modalCtaButtons.length > 1
                ? (modalCtaButtons[modalCtaButtons.length - 1] as HTMLButtonElement)
                : null;

            if (!continueButton || continueButton.disabled) {
                return;
            }

            continueButton.click();
            await wait(getRndInteger(150, 350));
        }
    },
});