import express from 'express';
import { createClient } from '@libsql/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'public/uploads/' });
fs.mkdirSync('public/uploads', { recursive: true });

const db = process.env.TURSO_DATABASE_URL ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }) : null;
const local = new Map();
const sessions = new Set();

const seedProducts = [
 ['Radiance Glow Serum','Skin Care','1490','https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=900&q=85','Brightening serum with a lightweight finish.'],
 ['Velvet Matte Lip Color','Makeup','890','https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=900&q=85','Long-wear velvet color for everyday glam.'],
 ['Hydra Balance Moisturizer','Skin Care','1190','https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85','Daily hydration with a soft, non-greasy feel.'],
 ['Silk Repair Hair Serum','Hair Care','990','https://images.unsplash.com/photo-1522338242992-e1a54906a8da?auto=format&fit=crop&w=900&q=85','Smooth, glossy finish for dry-looking hair.'],
 ['Vitamin E Body Lotion','Body Care','850','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85','Comforting moisture for soft skin.'],
 ['Daily Shield SPF 50+','Skin Care','1290','https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=85','Broad-spectrum daily sun protection.'],
 ['Onion Hair Oil','Hair Care','720','https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=900&q=85','Nourishing scalp and hair oil blend.'],
 ['Argan Luxe Hair Oil','Hair Care','1100','https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=900&q=85','Argan-inspired shine and softness treatment.'],
 ['Calm Cleansing Foam','Skin Care','790','https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85','Gentle cleanser for a fresh daily routine.'],
 ['Overnight Repair Cream','Skin Care','1390','https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=85','Rich night cream for a rested look.'],
 ['Rose Mist Toner','Skin Care','690','https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?auto=format&fit=crop&w=900&q=85','Refreshing facial mist for your routine.'],
 ['Premium Beauty Gift Set','Gift Set','2990','https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=85','Curated essentials for a complete beauty ritual.']
];

async function query(sql,args=[]){ if(!db) return null; return db.execute({sql,args}); }
async function init(){
 if(!db) return;
 await db.batch([
  `CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,category TEXT,price REAL,image TEXT,description TEXT,rating REAL DEFAULT 4.8,reviews INTEGER DEFAULT 0,stock INTEGER DEFAULT 25,featured INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_no TEXT UNIQUE,name TEXT,phone TEXT,address TEXT,payment TEXT,items TEXT,total REAL,status TEXT DEFAULT 'Pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER,name TEXT,rating INTEGER,comment TEXT,approved INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT)`
 ].map(sql=>({sql,args:[]})));
 const count=await query('SELECT COUNT(*) c FROM products');
 if(Number(count.rows[0].c)===0){ for(const p of seedProducts) await query('INSERT INTO products(name,category,price,image,description,rating,reviews,stock,featured) VALUES(?,?,?,?,?,?,?,?,?)', [...p,4.8,Math.floor(Math.random()*80)+12,25,1]); }
 const defaults={about:'MAHEER STORE brings curated beauty and personal-care essentials together with a premium, simple shopping experience. We focus on authentic products, clear information and responsive customer support.',phone:'+880 1671-989582',whatsapp:'8801671989582',facebook:'#',instagram:'#',tiktok:'#',youtube:'#',email:'hello@maheershop.com'};
 for(const [k,v] of Object.entries(defaults)) await query('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',[k,v]);
}
await init();

function localProducts(){return seedProducts.map((p,i)=>({id:i+1,name:p[0],category:p[1],price:Number(p[2]),image:p[3],description:p[4],rating:4.8,reviews:30+i*7,stock:25,featured:1}));}
function auth(req,res,next){ const token=req.headers.authorization?.replace('Bearer ',''); if(!token||!sessions.has(token)) return res.status(401).json({error:'Unauthorized'}); next(); }
function orderNo(){return 'MH'+Date.now().toString().slice(-8)+Math.floor(Math.random()*90+10);}

app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static('public'));
app.use('/admin',express.static('admin'));

app.get('/api/products',async(req,res)=>{ const q=(req.query.q||'').trim(); const cat=req.query.category||'all'; const sort=req.query.sort||'default'; let rows=[]; if(db){let sql='SELECT * FROM products WHERE 1=1'; const args=[]; if(q){sql+=' AND (name LIKE ? OR category LIKE ?)';args.push(`%${q}%`,`%${q}%`)} if(cat!=='all'){sql+=' AND category=?';args.push(cat)} if(sort==='low')sql+=' ORDER BY price ASC'; else if(sort==='high')sql+=' ORDER BY price DESC'; else if(sort==='rating')sql+=' ORDER BY rating DESC'; else sql+=' ORDER BY featured DESC,id DESC'; const r=await query(sql,args); rows=r.rows;} else rows=localProducts(); if(q) rows=rows.filter(x=>(x.name+x.category).toLowerCase().includes(q.toLowerCase())); if(cat!=='all')rows=rows.filter(x=>x.category===cat); if(sort==='low')rows.sort((a,b)=>a.price-b.price); if(sort==='high')rows.sort((a,b)=>b.price-a.price); if(sort==='rating')rows.sort((a,b)=>b.rating-a.rating); res.json(rows);});
app.get('/api/products/:id',async(req,res)=>{const r=db?await query('SELECT * FROM products WHERE id=?',[req.params.id]):null; const p=db?(r.rows[0]):localProducts()[Number(req.params.id)-1]; if(!p)return res.status(404).json({error:'Not found'}); const rr=db?await query('SELECT * FROM reviews WHERE product_id=? AND approved=1 ORDER BY id DESC',[req.params.id]):{rows:[]}; res.json({...p,reviewsList:rr.rows});});
app.get('/api/settings',async(req,res)=>{let s={about:'MAHEER STORE — premium beauty & personal care.',phone:'+880 1671-989582',whatsapp:'8801671989582',facebook:'#',instagram:'#',tiktok:'#',youtube:'#',email:'hello@maheershop.com'}; if(db){const r=await query('SELECT key,value FROM settings');r.rows.forEach(x=>s[x.key]=x.value)} res.json(s)});
app.post('/api/orders',async(req,res)=>{const {name,phone,address,payment='Cash on Delivery',items=[],total}=req.body;if(!name||!phone||!address||!items.length)return res.status(400).json({error:'Missing order details'});const no=orderNo();if(db)await query('INSERT INTO orders(order_no,name,phone,address,payment,items,total) VALUES(?,?,?,?,?,?,?)',[no,name,phone,address,payment,JSON.stringify(items),Number(total||0)]);else local.set(no,{order_no:no,name,phone,address,payment,items,total,status:'Pending'});res.json({ok:true,orderNo:no});});
app.get('/api/orders/:no',async(req,res)=>{let o;if(db){const r=await query('SELECT * FROM orders WHERE order_no=?',[req.params.no]);o=r.rows[0]}else o=local.get(req.params.no);if(!o)return res.status(404).json({error:'Order not found'});res.json(o)});
app.post('/api/reviews',async(req,res)=>{const {product_id,name,rating,comment}=req.body;if(db)await query('INSERT INTO reviews(product_id,name,rating,comment) VALUES(?,?,?,?)',[product_id,name,Number(rating),comment||'']);if(db)await query('UPDATE products SET rating=(SELECT ROUND(AVG(rating),1) FROM reviews WHERE product_id=?),reviews=(SELECT COUNT(*) FROM reviews WHERE product_id=?) WHERE id=?',[product_id,product_id,product_id]);res.json({ok:true});});

app.post('/api/chat',async(req,res)=>{
 const msg=String(req.body.message||'').trim();
 const lang=req.body.lang==='bn'?'bn':'en';
 if(!msg)return res.json({reply:lang==='bn'?'আমি Maheer Assistant। Product, price, order, delivery বা tracking নিয়ে জিজ্ঞেস করুন।':'I’m Maheer Assistant. Ask me about products, prices, orders, delivery or tracking.'});
 let products=db?(await query('SELECT id,name,price,category,description,rating,reviews,stock FROM products ORDER BY featured DESC,id DESC')).rows:localProducts();
 const settingsRows=db?(await query('SELECT key,value FROM settings')).rows:[]; const liveSettings={};settingsRows.forEach(x=>liveSettings[x.key]=x.value);
 const low=msg.toLowerCase();
 const product=products.find(p=>low.includes(String(p.name).toLowerCase())||low.includes(String(p.name).toLowerCase().split(' ')[0]));
 const orderMatch=msg.match(/\bMH\d{8,12}\b/i);
 if(orderMatch){let o;if(db){const r=await query('SELECT order_no,status,created_at,name,total FROM orders WHERE order_no=?',[orderMatch[0].toUpperCase()]);o=r.rows[0]}else o=local.get(orderMatch[0].toUpperCase());return res.json({reply:o?(lang==='bn'?`আপনার অর্ডার ${o.order_no} এখন “${o.status}” status-এ আছে।`: `Order ${o.order_no} is currently “${o.status}”.`):(lang==='bn'?'এই order number পাওয়া যায়নি। আবার check করুন।':'I could not find that order number. Please check it and try again.')});}
 if(/price|দাম|cost|কত টাকা|কত/.test(low)&&product)return res.json({reply:lang==='bn'?`${product.name} এর দাম ${money(product.price)}। Stock: ${product.stock>0?'Available':'Out of stock'}।`: `${product.name} is ${money(product.price)}. Stock: ${product.stock>0?'Available':'Out of stock'}.`});
 if(/rating|review|রেটিং|রিভিউ/.test(low)&&product)return res.json({reply:lang==='bn'?`${product.name} — ⭐ ${Number(product.rating||0).toFixed(1)} (${product.reviews||0} reviews)।`: `${product.name} — ⭐ ${Number(product.rating||0).toFixed(1)} (${product.reviews||0} reviews).`});
 if(/delivery|ডেলিভারি|shipping|শিপিং/.test(low))return res.json({reply:lang==='bn'?`আমাদের delivery information: ${liveSettings.delivery||'Checkout-এ ঠিকানা দিয়ে order confirm করুন। Support-এর জন্য Agent Contact ব্যবহার করতে পারেন।'}`:`Delivery information: ${liveSettings.delivery||'Enter your address at checkout and confirm the order. You can also use Agent Contact for support.'}`});
 if(/order|অর্ডার|কিনতে|buy|কীভাবে কিন/.test(low))return res.json({reply:lang==='bn'?'Product খুলুন → Buy Now বা Add to Bag → Checkout → নাম, ফোন ও ঠিকানা দিন। Order হলে MH নম্বর পাবেন, সেটি Track Order-এ ব্যবহার করুন।':'Open a product → Buy Now/Add to Bag → Checkout → enter name, phone and address. After placing the order you will receive an MH order number for tracking.'});
 if(product)return res.json({reply:lang==='bn'?`${product.name} — ${money(product.price)}। ${product.category}। Rating ⭐ ${Number(product.rating||0).toFixed(1)}। বিস্তারিত দেখতে product-এ click করুন।`:`${product.name} — ${money(product.price)}. ${product.category}. Rating ⭐ ${Number(product.rating||0).toFixed(1)}. Open the product to see details and order.`});
 if(/hello|hi|assalam|হাই|হ্যালো/.test(low))return res.json({reply:lang==='bn'?'Welcome to MAHEER STORE ✨ Skin care, hair care, makeup বা gift set—কী খুঁজছেন?':'Welcome to MAHEER STORE ✨ What are you looking for—skin care, hair care, makeup or gift sets?'});
 if(process.env.GEMINI_API_KEY){try{const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';const catalog=products.slice(0,40).map(p=>`${p.name} | ৳${p.price} | ${p.category} | rating ${p.rating||0} | stock ${p.stock||0}`).join('\n');const context=`You are Maheer Store Assistant for a Bangladesh beauty ecommerce store. Reply in ${lang==='bn'?'Bangla (you may keep product names in English)':'English'}. Use ONLY the live catalog/settings below for product facts. Never invent prices, stock, policies, delivery times or order status. If the customer wants to place an order, explain the website checkout flow. If they provide an MH order number, tell them to use Track Order unless the order status is supplied by the system.\nLIVE CATALOG:\n${catalog}\nSTORE PHONE: ${liveSettings.phone||''}`;const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:context+'\nCustomer: '+msg}]}],generationConfig:{temperature:.2,maxOutputTokens:220}})});const j=await r.json();const reply=j.candidates?.[0]?.content?.parts?.[0]?.text;if(reply)return res.json({reply,provider:'gemini'});}catch(e){}}
 return res.json({reply:lang==='bn'?'আমি product, price, rating, order, delivery ও tracking বিষয়ে সাহায্য করতে পারি। Product-এর নাম বা order number লিখুন।':'I can help with products, prices, ratings, orders, delivery and tracking. Type a product name or your order number.'});
});
app.post('/api/admin/login',(req,res)=>{if((req.body.password||'')!==(process.env.ADMIN_PASSWORD||'admin123'))return res.status(401).json({error:'Wrong password'});const t=crypto.randomBytes(24).toString('hex');sessions.add(t);res.json({token:t});});
app.get('/api/admin/products',auth,async(req,res)=>{const r=db?await query('SELECT * FROM products ORDER BY id DESC'):null;res.json(db?r.rows:localProducts());});
app.post('/api/admin/products',auth,async(req,res)=>{const p=req.body;if(db)await query('INSERT INTO products(name,category,price,image,description,rating,reviews,stock,featured) VALUES(?,?,?,?,?,?,?,?,?)',[p.name,p.category,Number(p.price),p.image,p.description||'',4.8,0,Number(p.stock||0),p.featured?1:0]);res.json({ok:true});});
app.put('/api/admin/products/:id',auth,async(req,res)=>{const p=req.body;if(db)await query('UPDATE products SET name=?,category=?,price=?,image=?,description=?,stock=?,featured=? WHERE id=?',[p.name,p.category,Number(p.price),p.image,p.description||'',Number(p.stock||0),p.featured?1:0,req.params.id]);res.json({ok:true});});
app.delete('/api/admin/products/:id',auth,async(req,res)=>{if(db)await query('DELETE FROM products WHERE id=?',[req.params.id]);res.json({ok:true});});
app.get('/api/admin/orders',auth,async(req,res)=>{const r=db?await query('SELECT * FROM orders ORDER BY id DESC'):null;res.json(db?r.rows:Array.from(local.values()).reverse());});
app.put('/api/admin/orders/:id',auth,async(req,res)=>{if(db)await query('UPDATE orders SET status=? WHERE id=?',[req.body.status,req.params.id]);res.json({ok:true});});
app.put('/api/admin/settings',auth,async(req,res)=>{for(const [k,v] of Object.entries(req.body)){if(db)await query('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[k,String(v)])}res.json({ok:true});});
app.post('/api/admin/upload',auth,upload.single('image'),(req,res)=>{if(!req.file)return res.status(400).json({error:'No file'});const ext=path.extname(req.file.originalname)||'.jpg';const target=`public/uploads/${req.file.filename}${ext}`;fs.renameSync(req.file.path,target);res.json({url:'/uploads/'+req.file.filename+ext});});
app.use((req,res)=>res.sendFile(path.resolve('public/index.html')));
app.listen(PORT,()=>console.log(`MAHEER STORE running on ${PORT}`));
