# KBBI Scraper API

A modern, high-performance REST API for the **Kamus Besar Bahasa Indonesia (KBBI)**, built with Node.js, Express 5, and TypeScript. This API scrapes the official KBBI site to provide structured, machine-readable definitions.

## 🚀 Features

- **Modern Stack**: Built with Express 5, Axios, and Cheerio.
- **TypeScript**: Fully typed for better developer experience and reliability.
- **Clean Architecture**: Follows the Controller-Service pattern for maintainability.
- **Structured Data**: Provides definitions, word classes (e.g., noun, verb), and headwords in a clean JSON format.
- **Reliable Scraper**: Updated for the latest KBBI website structure with robust error handling.

## 🛠 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/kbbi-api.git
   cd kbbi-api
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   BASE_URL=http://localhost:3000
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

5. **Start the server**:
   ```bash
   # Development mode (with auto-reload)
   npm run dev

   # Production mode
   npm start
   ```

## 📖 API Documentation

### Base URL
`http://localhost:3000`

### Endpoints

#### 1. Welcome / Info
Returns basic information about the API.

- **URL**: `/`
- **Method**: `GET`
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "message": "Welcome to New KBBI API",
      "endpoint": "/search/[word]",
      "example": "http://localhost:3000/search/demokrasi"
    }
    ```

#### 2. Search Word
Searches for a specific word in the KBBI database.

- **URL**: `/search/:word`
- **Method**: `GET`
- **URL Params**:
  - `word` (Required): The word to search for.
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "success": true,
      "message": "Search successful",
      "data": [
        {
          "headword": "de.mo.kra.si /démokrasi/",
          "definitions": [
            {
              "wordClass": "n[Nomina: kata benda] Pol[Politik dan Pemerintahan: -]",
              "description": "(bentuk atau sistem) pemerintahan yang seluruh rakyatnya turut serta memerintah dengan perantaraan wakilnya; pemerintahan rakyat"
            },
            {
              "wordClass": "n[Nomina: kata benda] Pol[Politik dan Pemerintahan: -]",
              "description": "gagasan atau pandangan hidup yang mengutamakan persamaan hak and kewajiban serta perlakuan yang sama bagi semua warga negara"
            }
          ]
        }
      ]
    }
    ```
- **Error Responses**:
  - **404 Not Found**:
    ```json
    {
      "success": false,
      "message": "Word not found"
    }
    ```
  - **500 Internal Server Error**:
    ```json
    {
      "success": false,
      "message": "Internal server error",
      "error": "Error message details"
    }
    ```

## 📂 Project Structure

```text
src/
├── config/             # Configuration and environment variables
├── controllers/        # Request handling and response logic
├── interfaces/         # TypeScript interfaces and types
├── routes/             # API route definitions
├── services/           # Business logic and scraping logic
├── app.ts              # Express application setup
└── server.ts           # Server entry point
```

## ⚖️ License

This project is licensed under the ISC License.

---
Built with ❤️ 
