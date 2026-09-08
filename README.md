# MAHEER STORE — Premium Full-Stack Ecommerce

Premium beauty/personal-care storefront inspired by the feature flow shown in the supplied reference recording, with a distinct MAHEER visual identity.

## Included
- Responsive mobile/tablet/desktop storefront
- Hero + category navigation + featured catalog
- Search, category filtering, price sorting and top-rated sorting
- Product detail modal with rating/review area, variants and quantity
- Cart / bag and checkout flow
- Order number generation + Track Order page
- Customer reviews database structure
- Agent WhatsApp + call support
- Floating social links
- Store chatbot built in code with local fallback
- Optional Google Gemini support via `GEMINI_API_KEY`
- Turso/LibSQL database backend
- Separate Admin Panel at `/admin`
- Admin product CRUD, image upload, stock, prices and featured flag
- Admin order status management
- Admin About Store + phone + WhatsApp + social URL management
- Render deployment config

## Environment variables
`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_PASSWORD`, `GEMINI_API_KEY`, `GEMINI_MODEL`.

If Gemini is not configured, the store still has a coded local assistant fallback; no chatbot API key is required for that fallback.

## Run
```bash
npm install
npm start
```
Open `/` for the store and `/admin` for the admin panel.
