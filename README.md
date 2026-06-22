# KBBI Scraper API

A modern, high-performance REST API for the **Kamus Besar Bahasa Indonesia (KBBI)**, built with Node.js, Express 5, and TypeScript. This API scrapes the official KBBI site to provide structured, machine-readable definitions.

## 🚀 Features

- **Modern Stack**: Built with Express 5, Axios, and Cheerio.
- **TypeScript**: Fully typed for better developer experience and reliability.
- **Clean Architecture**: Follows the Controller-Service pattern for maintainability.
- **Structured Data**: Provides definitions, word classes (e.g., noun, verb), and headwords in a clean JSON format.
- **Reliable Scraper**: Updated for the latest KBBI website structure with robust error handling.
- **Proverb List**: Scrapes the Indonesian proverb list from Wikiquote and exposes it as JSON.

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
      "endpoints": ["/search/[word]", "/proverb", "/proverb/search", "/proverb/[slug]"],
      "examples": [
        "http://localhost:3000/search/demokrasi",
        "http://localhost:3000/proverb?page=1&limit=20",
        "http://localhost:3000/proverb/search?q=air",
        "http://localhost:3000/proverb/Abu_saja_tak_hinggap"
      ]
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

#### 3. List Proverbs
Returns paginated Indonesian proverbs scraped from Wikiquote.

- **URL**: `/proverb`
- **Method**: `GET`
- **Query Params**:
  - `page` (Optional): Page number, starting from `1`. Defaults to `1`.
  - `limit` (Optional): Items per page. Defaults to `20`, maximum `100`.
- **Pagination Behavior**:
  - Uses page/limit pagination.
  - `total` is the total number of matching proverbs.
  - `totalPages` is calculated from `total` and `limit`.
  - `hasNextPage` and `hasPreviousPage` indicate whether adjacent pages are available.
  - If `page` is greater than `totalPages`, `items` will be an empty array.
- **Example**: `/proverb?page=1&limit=20`
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "success": true,
      "message": "Proverb list fetched successfully",
      "data": {
        "source": "https://id.wikiquote.org/wiki/Peribahasa_Indonesia",
        "pagination": {
          "page": 1,
          "limit": 20,
          "total": 1371,
          "totalPages": 69,
          "hasNextPage": true,
          "hasPreviousPage": false
        },
        "items": [
          {
            "text": "Ada gula ada semut",
            "letter": "A",
            "slug": "Ada_gula_ada_semut",
            "sourceUrl": "https://id.wikiquote.org/wiki/Ada_gula_ada_semut"
          }
        ]
      }
    }
    ```

#### 4. Search Proverbs
Searches proverbs by text and returns paginated results.

- **URL**: `/proverb/search`
- **Method**: `GET`
- **Query Params**:
  - `q` (Required): Search keyword.
  - `page` (Optional): Page number, starting from `1`. Defaults to `1`.
  - `limit` (Optional): Items per page. Defaults to `20`, maximum `100`.
- **Example**: `/proverb/search?q=gula&page=1&limit=5`
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "success": true,
      "message": "Proverb search successful",
      "data": {
        "source": "https://id.wikiquote.org/wiki/Peribahasa_Indonesia",
        "pagination": {
          "page": 1,
          "limit": 5,
          "total": 3,
          "totalPages": 1,
          "hasNextPage": false,
          "hasPreviousPage": false
        },
        "items": [
          {
            "text": "Ada gula ada semut",
            "letter": "A",
            "slug": "Ada_gula_ada_semut",
            "sourceUrl": "https://id.wikiquote.org/wiki/Ada_gula_ada_semut"
          }
        ]
      }
    }
    ```
- **Error Responses**:
  - **400 Bad Request**:
    ```json
    {
      "success": false,
      "message": "Query parameter 'q' is required"
    }
    ```

#### 5. Proverb Detail
Returns a proverb and its meaning from the proverb detail page.

- **URL**: `/proverb/:slug`
- **Method**: `GET`
- **URL Params**:
  - `slug` (Required): Wikiquote page slug for the proverb. Use the `slug` returned from `/proverb` or `/proverb/search`.
- **Example**: `/proverb/Abu_saja_tak_hinggap`
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "success": true,
      "message": "Proverb detail fetched successfully",
      "data": {
        "text": "Abu saja tak hinggap",
        "letter": "A",
        "slug": "Abu_saja_tak_hinggap",
        "sourceUrl": "https://id.wikiquote.org/wiki/Abu_saja_tak_hinggap",
        "meaning": "sesuatu yang sangat bersih dan berkilau"
      }
    }
    ```
- **Error Responses**:
  - **404 Not Found**:
    ```json
    {
      "success": false,
      "message": "Proverb not found"
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
