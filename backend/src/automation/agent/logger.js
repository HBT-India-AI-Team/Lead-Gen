export const logger = {

    info(message) {

        console.log(`[INFO] ${message}`);

    },

    success(message) {

        console.log(`✅ ${message}`);

    },

    warning(message) {

        console.log(`⚠ ${message}`);

    },

    error(message) {

        console.log(`❌ ${message}`);

    }

};