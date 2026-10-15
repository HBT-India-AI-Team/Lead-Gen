class ProgressTracker {

    constructor() {

        this.reset();

    }

    reset() {

        this.startTime = null;

        this.endTime = null;

        this.currentCategory = "";

        this.currentPage = 0;

        this.currentCard = 0;

        this.categories = 0;

        this.pages = 0;

        this.cards = 0;

        this.inserted = 0;

        this.duplicates = 0;

        this.failed = 0;

    }

    start() {

        this.startTime = Date.now();

    }

    finish() {

        this.endTime = Date.now();

    }

    setCategory(name) {

        this.currentCategory = name;

    }

    setPage(number) {

        this.currentPage = number;

    }

    setCard(number) {

        this.currentCard = number;

    }

    incrementCategory() {

        this.categories++;

    }

    incrementPage() {

        this.pages++;

    }

    incrementCard() {

        this.cards++;

    }

    incrementInserted() {

        this.inserted++;

    }

    incrementDuplicate() {

        this.duplicates++;

    }

    incrementFailed() {

        this.failed++;

    }

}

export const progress = new ProgressTracker();