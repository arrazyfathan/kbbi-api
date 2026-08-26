# API Documentation

## Base URL

`http://localhost:3000`

Versioned domain endpoints are available under `/api/v1`. Legacy root-level domain routes remain available temporarily for backward compatibility during migration.

## Error Response Contract

Every API response includes an `x-request-id` response header. Clients may send `X-Request-Id` to provide their own correlation ID; when omitted, the API generates one. Request and error logs use the same request ID.

All API error responses include a stable error code and the request ID:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "code": "VALIDATION_ERROR",
  "requestId": "018f0b6f-23b9-7f47-a8d9-0f3d3a1f3c7a"
}
```

Validation errors include `details` when useful:

```json
{
  "success": false,
  "message": "Query parameter 'q' is required",
  "code": "VALIDATION_ERROR",
  "requestId": "018f0b6f-23b9-7f47-a8d9-0f3d3a1f3c7a",
  "details": [
    {
      "field": "q",
      "location": "query",
      "reason": "Required non-empty string"
    }
  ]
}
```

Public error codes:

| Code                   | Typical HTTP Status | Description                                              |
| ---------------------- | ------------------- | -------------------------------------------------------- |
| `VALIDATION_ERROR`     | 400                 | Request params, query, or body values are invalid.       |
| `NOT_FOUND`            | 404                 | The requested endpoint or resource was not found.        |
| `RATE_LIMITED`         | 429                 | The request exceeded the configured rate limit.          |
| `UPSTREAM_TIMEOUT`     | 504                 | A scraper or external service timed out.                 |
| `UPSTREAM_UNAVAILABLE` | 502 or 503          | A scraper, Supabase, or external service is unavailable. |
| `INTERNAL_ERROR`       | 500                 | An unexpected server error occurred.                     |

Production internal errors intentionally use a generic message and do not expose private exception details.

## Endpoints

### 1. Welcome / Info

Returns basic information about the API.

- **URL**: `/`
- **Method**: `GET`
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "message": "Welcome to New KBBI API",
      "endpoints": [
        "/api/v1/search/[word]",
        "/api/v1/words/top",
        "/api/v1/proverb",
        "/api/v1/proverb/search",
        "/api/v1/proverb/[slug]",
        "/api/v1/figure",
        "/api/v1/figure/search",
        "/api/v1/figure/[slug]",
        "/api/v1/translate/[word]"
      ],
      "examples": [
        "http://localhost:3000/api/v1/search/demokrasi",
        "http://localhost:3000/api/v1/words/top?limit=10",
        "http://localhost:3000/api/v1/proverb?page=1&limit=20",
        "http://localhost:3000/api/v1/proverb/search?q=air",
        "http://localhost:3000/api/v1/proverb/Abu_saja_tak_hinggap",
        "http://localhost:3000/api/v1/figure?page=1&limit=10",
        "http://localhost:3000/api/v1/figure/search?q=soekarno",
        "http://localhost:3000/api/v1/figure/Soekarno",
        "http://localhost:3000/api/v1/translate/demokrasi"
      ]
    }
    ```

### 2. Search Word

Searches for a specific word in the KBBI database.

- **URL**: `/api/v1/search/:word`
- **Method**: `GET`
- **URL Params**:
  - `word` (Required): The word to search for.
- **Headers**:
  - `X-Request-Id` (Optional): Client-provided request correlation ID. The API returns the same value in the `x-request-id` response header, or generates one when this header is missing.
  - `X-Visitor-Id` (Optional): Stable anonymous UUID generated and stored by the mobile client. When present, the API hashes it with the server-side visitor salt and counts one unique visit per word per visitor per day.
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "success": true,
      "message": "Search successful",
      "data": {
        "word": "demokrasi",
        "visitorCount": 12,
        "entries": [
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
    }
    ```
  - `visitorCount` is `null` when `X-Visitor-Id` is missing or Supabase tracking is unavailable. Raw visitor IDs are not stored or logged.
- **Error Responses**:
  - **404 Not Found**:
    ```json
    {
      "success": false,
      "message": "Word not found",
      "code": "NOT_FOUND",
      "requestId": "018f0b6f-23b9-7f47-a8d9-0f3d3a1f3c7a"
    }
    ```
  - **500 Internal Server Error**:
    ```json
    {
      "success": false,
      "message": "Internal server error",
      "code": "INTERNAL_ERROR",
      "requestId": "018f0b6f-23b9-7f47-a8d9-0f3d3a1f3c7a"
    }
    ```

### 3. Top Visited Words

Returns the most visited KBBI words, ranked by all-time unique daily visitor records.

- **URL**: `/api/v1/words/top`
- **Method**: `GET`
- **Query Params**:
  - `limit` (Optional): Number of words to return. Defaults to `10`, maximum `100`.
- **Example**: `/api/v1/words/top?limit=10`
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "success": true,
      "message": "Top visited words fetched successfully",
      "data": {
        "count": 2,
        "items": [
          {
            "word": "demokrasi",
            "visitorCount": 12
          },
          {
            "word": "ajar",
            "visitorCount": 8
          }
        ]
      }
    }
    ```

### 4. List Proverbs

Returns paginated Indonesian proverbs scraped from Wikiquote.

- **URL**: `/api/v1/proverb`
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
- **Example**: `/api/v1/proverb?page=1&limit=20`
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

### 5. Search Proverbs

Searches proverbs by text and returns paginated results.

- **URL**: `/api/v1/proverb/search`
- **Method**: `GET`
- **Query Params**:
  - `q` (Required): Search keyword.
  - `page` (Optional): Page number, starting from `1`. Defaults to `1`.
  - `limit` (Optional): Items per page. Defaults to `20`, maximum `100`.
- **Example**: `/api/v1/proverb/search?q=gula&page=1&limit=5`
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
      "message": "Query parameter 'q' is required",
      "code": "VALIDATION_ERROR",
      "requestId": "018f0b6f-23b9-7f47-a8d9-0f3d3a1f3c7a",
      "details": [
        {
          "field": "q",
          "location": "query",
          "reason": "Required non-empty string"
        }
      ]
    }
    ```

### 6. Proverb Detail

Returns a proverb and its meaning from the proverb detail page.

- **URL**: `/api/v1/proverb/:slug`
- **Method**: `GET`
- **URL Params**:
  - `slug` (Required): Wikiquote page slug for the proverb. Use the `slug` returned from `/api/v1/proverb` or `/api/v1/proverb/search`.
- **Example**: `/api/v1/proverb/Abu_saja_tak_hinggap`
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
      "message": "Proverb not found",
      "code": "NOT_FOUND",
      "requestId": "018f0b6f-23b9-7f47-a8d9-0f3d3a1f3c7a"
    }
    ```

### 7. List Indonesian Figures

Returns paginated Indonesian figure summaries scraped from Wikiquote. By default, items include only `name`, `slug`, and `sourceUrl` so the endpoint does not fetch every detail page.

- **URL**: `/api/v1/figure`
- **Method**: `GET`
- **Query Params**:
  - `page` (Optional): Page number, starting from `1`. Defaults to `1`.
  - `limit` (Optional): Items per page. Defaults to `20`, maximum `50`.
  - `includeDetails` (Optional): Set to `true` to include `photo`, `description`, and `quotes` in each item. Defaults to `false`.
- **Example**: `/api/v1/figure?page=1&limit=10`
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "success": true,
      "message": "Indonesian figure list fetched successfully",
      "data": {
        "source": "https://id.wikiquote.org/wiki/Kategori:Tokoh_Indonesia",
        "pagination": {
          "page": 1,
          "limit": 10,
          "total": 346,
          "totalPages": 35,
          "hasNextPage": true,
          "hasPreviousPage": false
        },
        "items": [
          {
            "name": "Soekarno",
            "slug": "Soekarno",
            "sourceUrl": "https://id.wikiquote.org/wiki/Soekarno"
          }
        ]
      }
    }
    ```

### 8. Search Indonesian Figures

Searches Indonesian figures by name and returns paginated summaries by default.

- **URL**: `/api/v1/figure/search`
- **Method**: `GET`
- **Query Params**:
  - `q` (Required): Search keyword.
  - `page` (Optional): Page number, starting from `1`. Defaults to `1`.
  - `limit` (Optional): Items per page. Defaults to `20`, maximum `50`.
  - `includeDetails` (Optional): Set to `true` to include `photo`, `description`, and `quotes` in each item. Defaults to `false`.
- **Example**: `/api/v1/figure/search?q=soekarno`

### 9. Indonesian Figure Detail

Returns one Indonesian figure from a Wikiquote slug.

- **URL**: `/api/v1/figure/:slug`
- **Method**: `GET`
- **URL Params**:
  - `slug` (Required): Wikiquote page slug, for example `Soekarno`.
- **Example**: `/api/v1/figure/Soekarno`
- **Nullable Fields**:
  - `name`, `photo`, `description`, and `quotes` may be `null` when Wikiquote does not provide that data.
- **Error Responses**:
  - **404 Not Found**:
    ```json
    {
      "success": false,
      "message": "Indonesian figure not found",
      "code": "NOT_FOUND",
      "requestId": "018f0b6f-23b9-7f47-a8d9-0f3d3a1f3c7a"
    }
    ```

### 10. Translate Word Meanings

Looks up a word in KBBI and translates the word itself and every one of its meanings from Indonesian (`id`) to a target language. Google Translate is used first, with Lara Translate as an optional configured fallback. This is useful for a client-side toggle button that shows or hides the English translation of each meaning.

- **URL**: `/api/v1/translate/:word`
- **Method**: `GET`
- **URL Params**:
  - `word` (Required): The word whose meanings should be translated.
- **Query Params**:
  - `to` (Optional): Target ISO 639-1/639-2 language code. Defaults to `en`.
- **Example**: `/api/v1/translate/demokrasi?to=en`
- **Success Response**:
  - **Code**: 200 OK
  - **Content**:
    ```json
    {
      "success": true,
      "message": "Translation successful",
      "data": {
        "word": "demokrasi",
        "translation": "democracy",
        "from": "id",
        "to": "en",
        "provider": "google",
        "entries": [
          {
            "headword": "de.mo.kra.si /démokrasi/",
            "definitions": [
              {
                "wordClass": "n[Nomina: kata benda] Pol[Politik dan Pemerintahan: -]",
                "description": "(bentuk atau sistem) pemerintahan yang seluruh rakyatnya turut serta memerintah dengan perantaraan wakilnya; pemerintahan rakyat",
                "translation": "(form or system) of government in which all the people participate in governing through their representatives; people's government"
              }
            ]
          }
        ]
      }
    }
    ```
  - `data.translation` is the word itself translated to the target language. `data.provider` identifies whether Google (`google`) or Lara (`lara`) produced the result. Each `definition` also gains a `translation` field alongside the original `description`. A `translation` may be an empty string when the translation provider returns no result for that text.
- **Error Responses**:
  - **404 Not Found**:
    ```json
    {
      "success": false,
      "message": "Word not found",
      "code": "NOT_FOUND",
      "requestId": "018f0b6f-23b9-7f47-a8d9-0f3d3a1f3c7a"
    }
    ```
  - **502 Bad Gateway**: Returned when all configured translation providers are unavailable.
  - **504 Gateway Timeout**: Returned when the final configured translation provider times out.
