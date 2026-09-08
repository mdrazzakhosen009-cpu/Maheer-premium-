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
 ['Radiance Gentle Cleanser','Cleanser','790','https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=900&q=85','Gentle daily cleanser for a fresh, comfortable finish.'],
 ['Niacinamide Glow Serum','Serum','1490','https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=900&q=85','Lightweight serum for a smoother, brighter-looking routine.'],
 ['Daily Shield Sunscreen SPF 50+','Sunscreen','1290','https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=85','Comfortable daily sun protection for every routine.'],
 ['Hydra Balance Body Lotion','Body Care','850','https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85','Rich but lightweight body moisture for everyday softness.'],
 ['Velvet Repair Lip Care','Lip Care','690','https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=900&q=85','Nourishing lip care for smooth, comfortable lips.'],
 ['Calm Foam Cleanser','Cleanser','890','https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85','Soft foam cleanser for a balanced daily routine.'],
 ['Glass Skin Peptide Serum','Serum','1690','https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=85','Hydrating peptide serum with a dewy finish.'],
 ['Invisible Sun Fluid SPF 50','Sunscreen','1390','https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?auto=format&fit=crop&w=900&q=85','Lightweight daily sunscreen with a silky texture.'],
 ['Silk Soft Body Butter','Body Care','990','https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=85','Rich body butter for long-lasting softness.'],
 ['Repairing Lip Mask','Lip Care','750','https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=900&q=85','Overnight lip treatment for a soft, smooth feel.'],
 ['Vitamin C Bright Serum','Serum','1550','https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=85','Daily vitamin C serum for a fresh-looking complexion.'],
 ['Daily Fresh Cleanser','Cleanser','720','https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85','A simple everyday cleanse for clean, comfortable skin.']
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
 else { for(const p of seedProducts){ const exists=await query('SELECT id FROM products WHERE name=? LIMIT 1',[p[0]]); if(!exists.rows.length) await query('INSERT INTO products(name,category,price,image,description,rating,reviews,stock,featured) VALUES(?,?,?,?,?,?,?,?,?)',[...p,4.8,Math.floor(Math.random()*80)+12,25,1]); } }
 const defaults={delivery:'Free delivery across Bangladesh.',about:'MAHEER STORE brings curated beauty and personal-care essentials together with a premium, simple shopping experience. Free delivery across Bangladesh, free consultation, 24 hour service and a focus on authentic products.',phone:'+880 1671-989582',whatsapp:'8801671989582',delivery:'Free delivery across Bangladesh.',facebook:'#',instagram:'#',tiktok:'#',youtube:'#',email:'hello@maheershop.com'};
 for(const [k,v] of Object.entries(defaults)) await query('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',[k,v]);
}
await init();

function localProducts(){return seedProducts.map((p,i)=>({id:i+1,name:p[0],category:p[1],price:Number(p[2]),image:p[3],description:p[4],rating:4.8,reviews:30+i*7,stock:25,featured:1}));}
function auth(req,res,next){ const token=req.headers.authorization?.replace('Bearer ',''); if(!token||!sessions.has(token)) return res.status(401).json({error:'Unauthorized'}); next(); }
function money(n){return '৳'+Number(n||0).toLocaleString('en-BD')}
function orderNo(){return 'MH'+Date.now().toString().slice(-8)+Math.floor(Math.random()*90+10);}

app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static('public'));
app.use('/admin',express.static('admin'));

app.get('/api/products',async(req,res)=>{ const q=(req.query.q||'').trim(); const cat=req.query.category||'all'; const sort=req.query.sort||'default'; let rows=[]; if(db){let sql='SELECT * FROM products WHERE 1=1'; const args=[]; if(q){sql+=' AND (name LIKE ? OR category LIKE ?)';args.push(`%${q}%`,`%${q}%`)} if(cat!=='all'){const aliases={Cleanser:['cleanser','foam'],Serum:['serum'],Sunscreen:['sunscreen','spf'],"Body Care":['body','lotion'],"Lip Care":['lip']};if(aliases[cat]){sql+=' AND (category=? OR '+aliases[cat].map(()=> 'LOWER(name) LIKE ?').join(' OR ')+')';args.push(cat,...aliases[cat].map(k=>'%'+k+'%'));}else{sql+=' AND category=?';args.push(cat)}} if(sort==='low')sql+=' ORDER BY price ASC'; else if(sort==='high')sql+=' ORDER BY price DESC'; else if(sort==='rating')sql+=' ORDER BY rating DESC'; else sql+=' ORDER BY featured DESC,id DESC'; const r=await query(sql,args); rows=r.rows;} else rows=localProducts(); if(q) rows=rows.filter(x=>(x.name+x.category).toLowerCase().includes(q.toLowerCase())); if(cat!=='all')rows=rows.filter(x=>x.category===cat); if(sort==='low')rows.sort((a,b)=>a.price-b.price); if(sort==='high')rows.sort((a,b)=>b.price-a.price); if(sort==='rating')rows.sort((a,b)=>b.rating-a.rating); res.json(rows);});
app.get('/api/products/:id',async(req,res)=>{const r=db?await query('SELECT * FROM products WHERE id=?',[req.params.id]):null; const p=db?(r.rows[0]):localProducts()[Number(req.params.id)-1]; if(!p)return res.status(404).json({error:'Not found'}); const rr=db?await query('SELECT * FROM reviews WHERE product_id=? AND approved=1 ORDER BY id DESC',[req.params.id]):{rows:[]}; res.json({...p,reviewsList:rr.rows});});
app.get('/api/settings',async(req,res)=>{let s={about:'MAHEER STORE — premium beauty & personal care.',phone:'+880 1671-989582',whatsapp:'8801671989582',delivery:'Free delivery across Bangladesh.',facebook:'#',instagram:'#',tiktok:'#',youtube:'#',email:'hello@maheershop.com'}; if(db){const r=await query('SELECT key,value FROM settings');r.rows.forEach(x=>s[x.key]=x.value)} res.json(s)});
app.post('/api/orders',async(req,res)=>{const {name,phone,address,payment='Cash on Delivery',items=[],total}=req.body;if(!name||!phone||!address||!items.length)return res.status(400).json({error:'Missing order details'});const no=orderNo();if(db)await query('INSERT INTO orders(order_no,name,phone,address,payment,items,total) VALUES(?,?,?,?,?,?,?)',[no,name,phone,address,payment,JSON.stringify(items),Number(total||0)]);else local.set(no,{order_no:no,name,phone,address,payment,items,total,status:'Pending'});res.json({ok:true,orderNo:no});});
app.get('/api/orders/:no',async(req,res)=>{let o;if(db){const r=await query('SELECT * FROM orders WHERE order_no=?',[req.params.no]);o=r.rows[0]}else o=local.get(req.params.no);if(!o)return res.status(404).json({error:'Order not found'});res.json(o)});
app.post('/api/reviews',async(req,res)=>{const {product_id,name,rating,comment}=req.body;if(db)await query('INSERT INTO reviews(product_id,name,rating,comment) VALUES(?,?,?,?)',[product_id,name,Number(rating),comment||'']);if(db)await query('UPDATE products SET rating=(SELECT ROUND(AVG(rating),1) FROM reviews WHERE product_id=?),reviews=(SELECT COUNT(*) FROM reviews WHERE product_id=?) WHERE id=?',[product_id,product_id,product_id]);res.json({ok:true});});

app.post('/api/chat',async(req,res)=>{
 const msg=String(req.body.message||'').trim(); const lang=req.body.lang==='bn'?'bn':'en'; const contextProduct=req.body.contextProduct||null;
 if(!msg)return res.json({reply:lang==='bn'?'আমি Maheer Assistant। Product, price, delivery, review বা order নিতে পারি।':'I’m Maheer Assistant. I can help with products, prices, delivery, reviews and placing an order.'});
 const products=db?(await query('SELECT id,name,price,category,description,rating,reviews,stock FROM products ORDER BY featured DESC,id DESC')).rows:localProducts();
 const settingsRows=db?(await query('SELECT key,value FROM settings')).rows:[]; const liveSettings={};settingsRows.forEach(x=>liveSettings[x.key]=x.value);
 const low=msg.toLowerCase();
 let product=products.find(p=>low.includes(String(p.name).toLowerCase()));
 if(!product){ const byCategory=['cleanser','ক্লেনজার','serum','সিরাম','sunscreen','সানস্ক্রিন','body care','বডি কেয়ার','lip care','লিপ কেয়ার'].find(c=>low.includes(c)); if(byCategory){ const map=byCategory.includes('serum')?'Serum':byCategory.includes('sunscreen')?'Sunscreen':byCategory.includes('body')||byCategory.includes('বডি')?'Body Care':byCategory.includes('lip')||byCategory.includes('লিপ')?'Lip Care':'Cleanser'; product=products.find(p=>p.category===map); } }
 if(!product && contextProduct?.id){ product=products.find(p=>Number(p.id)===Number(contextProduct.id)); }
 const orderMatch=msg.match(/\bMH\d{8,12}\b/i);
 if(orderMatch){let o;if(db){const r=await query('SELECT order_no,status,created_at,name,total FROM orders WHERE order_no=?',[orderMatch[0].toUpperCase()]);o=r.rows[0]}else o=local.get(orderMatch[0].toUpperCase());return res.json({reply:o?(lang==='bn'?`আপনার order ${o.order_no} এখন “${o.status}” status-এ আছে। Total ${money(o.total)}।`:`Order ${o.order_no} is currently “${o.status}”. Total ${money(o.total)}.`):(lang==='bn'?'এই order number পাওয়া যায়নি। আবার check করুন।':'I could not find that order number. Please check it and try again.')});}
 if(/order|অর্ডার|কিনতে|buy|নিব|নিতে চাই|order now/.test(low)){if(!product){const names=products.slice(0,6).map(p=>p.name).join(', ');return res.json({reply:lang==='bn'?`অবশ্যই। কোন product নিতে চান? যেমন: ${names}`:`Absolutely. Which product would you like to order? For example: ${names}`})} const qtyMatch=low.match(/(?:x|qty|quantity|টা|pieces?|pcs?)\s*(\d+)|\b(\d+)\b/i);const qty=Math.max(1,Math.min(10,Number(qtyMatch?.[1]||qtyMatch?.[2]||1)));return res.json({orderStart:true,qty,product:{id:product.id,name:product.name,price:Number(product.price),image:product.image,category:product.category},reply:lang==='bn'?`${product.name} — ${money(product.price)}। কতটি নিতে চান, এবং order নেওয়া শুরু করছি।`:`${product.name} — ${money(product.price)}. I can take this order for you now.`});}
 if(/price|দাম|cost|কত টাকা|কত/.test(low)&&product)return res.json({reply:lang==='bn'?`${product.name} এর দাম ${money(product.price)}। ${product.stock>0?'Stock available':'Out of stock'}।`:`${product.name} is ${money(product.price)}. ${product.stock>0?'Stock available':'Out of stock'}.`});
 if(/rating|review|রেটিং|রিভিউ/.test(low)&&product)return res.json({reply:lang==='bn'?`${product.name} — ⭐ ${Number(product.rating||0).toFixed(1)} (${product.reviews||0} reviews)।`:`${product.name} — ⭐ ${Number(product.rating||0).toFixed(1)} (${product.reviews||0} reviews).`});
 if(/delivery|ডেলিভারি|shipping|শিপিং/.test(low))return res.json({reply:lang==='bn'?'সারা বাংলাদেশে Free Delivery। ২৪ ঘণ্টা service ও support আছে।':'Free delivery across Bangladesh, with 24-hour service and support.'});
 if(/authentic|অথেন্টিক|original|অরিজিনাল/.test(low))return res.json({reply:lang==='bn'?'MAHEER STORE-এ 100% authentic products দেওয়ার লক্ষ্য রাখা হয়েছে।':'MAHEER STORE focuses on 100% authentic products.'});
 if(process.env.GEMINI_API_KEY){try{const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';const catalog=products.slice(0,40).map(p=>`${p.name} | ৳${p.price} | ${p.category} | rating ${p.rating||0} | stock ${p.stock||0}`).join('\n');const context=`You are Maheer Store Assistant for a Bangladesh beauty ecommerce store. Reply in ${lang==='bn'?'Bangla (product names may remain English)':'English'}. Use only the live catalog/settings. Store policies: free delivery across Bangladesh, free consultation, 24 hour service, 100% authentic products. Never invent product facts. If user wants to order, ask for product name/quantity then use the website order flow.`;const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:context+'\nCATALOG:\n'+catalog+'\nSTORE PHONE:'+liveSettings.phone+'\nCustomer:'+msg}]}],generationConfig:{temperature:.2,maxOutputTokens:220}})});const j=await r.json();const reply=j.candidates?.[0]?.content?.parts?.[0]?.text;if(reply)return res.json({reply,provider:'gemini'});}catch(e){}}
 return res.json({reply:lang==='bn'?'আমি product, price, rating, delivery, order ও tracking নিয়ে সাহায্য করতে পারি। Product-এর নাম লিখুন।':'I can help with products, prices, ratings, delivery, ordering and tracking. Type a product name.'});
});

app.post('/api/admin/login',(req,res)=>{const password=String(req.body.password||'');const expected=process.env.ADMIN_PASSWORD||'maheer123';if(!password||password!==expected)return res.status(401).json({error:'Invalid admin password'});const token=crypto.randomBytes(24).toString('hex');sessions.add(token);res.json({token})});

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
