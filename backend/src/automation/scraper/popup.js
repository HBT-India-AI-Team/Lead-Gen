export async function closePopup(page) {

    try {

        // Wait briefly to see if a popup appears
        await page.waitForTimeout(1000);

        // Find the close button (the HTML you shared)
        const closeButton = page.locator(
            'button:has(svg.lucide-x)'
        ).first();

        if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {

            console.log("Popup detected. Closing...");

            await closeButton.click();

            await page.waitForTimeout(500);

            console.log("Popup closed.");

        }

    } catch (error) {

        // No popup found, continue silently
        console.log("No popup detected.");

    }

}