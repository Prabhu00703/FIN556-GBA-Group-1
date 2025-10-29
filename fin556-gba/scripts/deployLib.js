const fs = require("fs");

// Function to safely update JSON file
function saveJson(filePath, updates) {
    let data = {};

    // Read existing file if it exists
    if (fs.existsSync(filePath)) {
        try {
            const fileContent = fs.readFileSync(filePath, "utf8");
            data = JSON.parse(fileContent);
        } catch (error) {
            console.error("Error reading JSON file:", error);
            data = {};
        }
    }

    // Merge updates with existing data
    data = { ...data, ...updates };

    // Write back to file
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`✅ Updated ${filePath} successfully`);
    } catch (error) {
        console.error("Error writing JSON file:", error);
        throw error;
    }

    return data;
}

// Function to get a specific address by key
function getAddress(filePath, key) {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.error(`File ${filePath} does not exist`);
        return null;
    }

    try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(fileContent);

        if (key in data) {
            return data[key];
        } else {
            console.error(`Key "${key}" not found in ${filePath}`);
            return null;
        }
    } catch (error) {
        console.error("Error reading JSON file:", error);
        return null;
    }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports = { saveJson, getAddress, delay };
module.exports = { saveJson, getAddress, delay }; // For compatibility with both CommonJS and ES modules
