export async function gotoPage(page, categoryUrl, pageNumber) {

    const url = `${categoryUrl}?page=${pageNumber}`;

    console.log(`Opening Page ${pageNumber + 1}`);

    await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000
    });

    return true;

}