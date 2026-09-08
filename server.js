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
 const msg=String(req.body.message||'').trim();
 const lang=req.body.lang==='bn'?'bn':'en';
 const contextProduct=req.body.contextProduct||null;
 const history=Array.isArray(req.body.history)?req.body.history.slice(-8):[];
 if(!msg)return res.json({reply:lang==='bn'?'হাই 👋 আমি MAHEER Assistant। Product, দাম, রিভিউ, delivery, order, tracking বা beauty routine নিয়ে জিজ্ঞেস করুন।':'Hi 👋 I’m MAHEER Assistant. Ask me about products, prices, reviews, delivery, orders, tracking or beauty routines.'});
 const products=db?(await query('SELECT id,name,price,category,description,rating,reviews,stock FROM products ORDER BY featured DESC,id DESC')).rows:localProducts();
 const settingsRows=db?(await query('SELECT key,value FROM settings')).rows:[];
 const liveSettings={};settingsRows.forEach(x=>liveSettings[x.key]=x.value);
 const low=msg.toLowerCase();
 const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g,' ').trim();
 const nmsg=norm(msg);
 const aliases={
   cleanser:['cleanser','face wash','facewash','ক্লেনজার','ফেস ওয়াশ','ফেসওয়াশ'],
   serum:['serum','সিরাম'], sunscreen:['sunscreen','sun screen','spf','সানস্ক্রিন'],
   body:['body care','body lotion','body butter','বডি কেয়ার','বডি লোশন'],
   lip:['lip care','lip balm','lip mask','লিপ কেয়ার','লিপ বাম']
 };
 function matchProduct(text){
   const nt=norm(text);
   let exact=products.find(p=>nt.includes(norm(p.name)));
   if(exact)return exact;
   let best=null,bestScore=0;
   for(const p of products){
     const words=norm(p.name).split(/\s+/).filter(w=>w.length>2);
     const score=words.reduce((n,w)=>n+(nt.includes(w)?1:0),0);
     if(score>bestScore){bestScore=score;best=p;}
   }
   return bestScore>=1?best:null;
 }
 function categoryProduct(text){
   for(const [cat,words] of Object.entries(aliases)) if(words.some(w=>low.includes(w))) {
     const map={cleanser:'Cleanser',serum:'Serum',sunscreen:'Sunscreen',body:'Body Care',lip:'Lip Care'};
     return products.find(p=>p.category===map[cat] && Number(p.stock)>0)||products.find(p=>p.category===map[cat])||null;
   }
   return null;
 }
 function categoryName(text){
   for(const [cat,words] of Object.entries(aliases)) if(words.some(w=>low.includes(w))) return {cleanser:'Cleanser',serum:'Serum',sunscreen:'Sunscreen',body:'Body Care',lip:'Lip Care'}[cat];
   return null;
 }
 let product=matchProduct(msg)||categoryProduct(msg);
 if(!product&&contextProduct?.id)product=products.find(p=>Number(p.id)===Number(contextProduct.id));
 const orderMatch=msg.match(/\bMH\d{8,14}\b/i);
 if(orderMatch){
   let o;if(db){const r=await query('SELECT order_no,status,created_at,name,total,items FROM orders WHERE order_no=?',[orderMatch[0].toUpperCase()]);o=r.rows[0]}else o=local.get(orderMatch[0].toUpperCase());
   return res.json({reply:o?(lang==='bn'?`আপনার order **${o.order_no}** এখন **${o.status}** status-এ আছে। মোট ${money(o.total)}। Delivery status পরিবর্তন হলে এখান থেকে আবার জিজ্ঞেস করতে পারবেন।`:`Your order **${o.order_no}** is currently **${o.status}**. Total ${money(o.total)}. You can ask me again anytime for the latest status.`):(lang==='bn'?'এই order numberটি পাওয়া যায়নি। Order No ঠিক আছে কিনা check করুন।':'I couldn’t find that order number. Please check the order number and try again.')});
 }
 const isGreeting=/^(hi|hello|hey|হাই|হ্যালো|আসসালামু|assalamu|good morning|good evening|good afternoon)\b/i.test(low);
 const isThanks=/\b(thanks|thank you|ধন্যবাদ|থ্যাংক)\b/i.test(low);
 const wantsOrder=/\b(order|buy|purchase|take it|i want it|send it|নিতে চাই|কিনতে চাই|অর্ডার|অর্ডার কর|অর্ডার দিতে|নেব|নিব|কিনব|দাও)\b/i.test(low);
 const wantsPrice=/\b(price|cost|দাম|মূল্য|কত টাকা|কতো টাকা|কত)\b/i.test(low);
 const wantsRating=/\b(rating|review|reviews|রেটিং|রিভিউ|কেমন)\b/i.test(low);
 const wantsDelivery=/\b(delivery|shipping|ship|ডেলিভারি|শিপিং|কুরিয়ার|কত দিনে|কখন পাব)\b/i.test(low);
 const wantsAuthentic=/\b(authentic|original|genuine|অথেন্টিক|অরিজিনাল|আসল)\b/i.test(low);
 const wantsHelp=/\b(help|support|agent|সাহায্য|সাপোর্ট|এজেন্ট|যোগাযোগ)\b/i.test(low);
 const wantsCategories=/\b(category|categories|collection|ক্যাটাগরি|কালেকশন|কি কি আছে|কী কী আছে)\b/i.test(low);
 const wantsRecommend=/\b(recommend|suggest|best|good|for me|আমার জন্য|ভালো কোন|সাজেস্ট|রেকমেন্ড)\b/i.test(low);
 const qtyMatch=low.match(/(?:x|qty|quantity|পরিমাণ|টা|টি|pcs?|pieces?)\s*(\d+)|\b(\d+)\s*(?:pcs?|pieces?|টা|টি)\b/i);
 const qty=Math.max(1,Math.min(10,Number(qtyMatch?.[1]||qtyMatch?.[2]||1)));
 const choiceMatch=msg.trim().match(/^[1-6]$/);
 if(choiceMatch && Array.isArray(history)){ const lastBot=history.slice().reverse().find(x=>x.role==='assistant' || x.role==='bot'); if(lastBot){ const listed=products.filter(p=>Number(p.stock)>0).slice(0,6); const idx=Number(choiceMatch[0])-1; if(listed[idx]) product=listed[idx]; }}
 if(isGreeting)return res.json({reply:lang==='bn'?'হ্যালো ❤️ MAHEER STORE-এ স্বাগতম! কী খুঁজছেন—Cleanser, Serum, Sunscreen, Body Care নাকি Lip Care? চাইলে আমি product recommend-ও করতে পারি।':'Hello ❤️ Welcome to MAHEER STORE! What are you looking for—Cleanser, Serum, Sunscreen, Body Care or Lip Care? I can also recommend something for you.'});
 if(isThanks)return res.json({reply:lang==='bn'?'আপনাকেও ধন্যবাদ ❤️ আর কিছু জানতে বা order করতে চাইলে বলুন।':'You’re very welcome ❤️ If you need anything else or want to place an order, just tell me.'});
 if(wantsCategories){
   const cats=[...new Set(products.map(p=>p.category))];
   return res.json({reply:lang==='bn'?`আমাদের categories: ${cats.join(' • ')}। কোনটা দেখতে চান?`:`Our categories are: ${cats.join(' • ')}. Which one would you like to explore?`});
 }
 if(wantsDelivery)return res.json({reply:lang==='bn'?'🚚 সারা বাংলাদেশে **Free Delivery**। 💬 **Free Consultation**, 🕐 **24 Hour Service** এবং customer support available।':'🚚 **Free delivery across Bangladesh.** We also offer 💬 **Free Consultation**, 🕐 **24 Hour Service**, and customer support.'});
 if(wantsAuthentic)return res.json({reply:lang==='bn'?'✅ MAHEER STORE-এ **100% authentic products** রাখার প্রতিশ্রুতি আছে। সন্দেহ হলে product name লিখুন—আমি details জানাব।':'✅ MAHEER STORE is committed to **100% authentic products**. Send me any product name and I’ll share its available details.'});
 if(wantsHelp)return res.json({reply:lang==='bn'?`অবশ্যই। আমি product selection, price, rating, delivery, order ও tracking-এ সাহায্য করতে পারি। সরাসরি human agent দরকার হলে WhatsApp: ${liveSettings.whatsapp||'8801671989582'}`:`Absolutely. I can help with product selection, price, ratings, delivery, ordering and tracking. If you need a human agent, WhatsApp: ${liveSettings.whatsapp||'8801671989582'}`});
 if(wantsRecommend&&!product){
   const available=products.filter(p=>Number(p.stock)>0).slice(0,3);
   return res.json({reply:lang==='bn'?`আপনার জন্য এইগুলো ভালো starting options হতে পারে:\n${available.map(p=>`• ${p.name} — ${money(p.price)} ⭐ ${Number(p.rating||0).toFixed(1)}`).join('\n')}\n\nআপনার skin concern/need বললে আরও specific suggestion দিতে পারি।`:`Here are a few good starting options:\n${available.map(p=>`• ${p.name} — ${money(p.price)} ⭐ ${Number(p.rating||0).toFixed(1)}`).join('\n')}\n\nTell me your skin concern or need and I can make a more specific suggestion.`});
 }
 if(wantsPrice&&product)return res.json({product,reply:lang==='bn'?`💰 **${product.name}** এর দাম **${money(product.price)}**। ${Number(product.stock)>0?'Stock available আছে।':'এই মুহূর্তে stock শেষ।'} Order করতে চাইলে শুধু **order** লিখুন।`:`💰 **${product.name}** is **${money(product.price)}**. ${Number(product.stock)>0?'It is in stock.':'It is currently out of stock.'} If you want it, just type **order**.`});
 if(wantsRating&&product)return res.json({product,reply:lang==='bn'?`⭐ **${product.name}** — ${Number(product.rating||4.8).toFixed(1)}/5 from ${product.reviews||0} reviews।`:`⭐ **${product.name}** — ${Number(product.rating||4.8).toFixed(1)}/5 from ${product.reviews||0} reviews.`});
 if(product&&!wantsOrder&&!wantsPrice&&!wantsRating){
   return res.json({product,reply:lang==='bn'?`**${product.name}**\n${product.description||'Premium selection from MAHEER STORE.'}\n💰 ${money(product.price)} • ⭐ ${Number(product.rating||4.8).toFixed(1)} (${product.reviews||0} reviews)\n\nOrder করতে চাইলে **order** লিখুন।`:`**${product.name}**\n${product.description||'Premium selection from MAHEER STORE.'}\n💰 ${money(product.price)} • ⭐ ${Number(product.rating||4.8).toFixed(1)} (${product.reviews||0} reviews)\n\nType **order** if you want to buy it.`});
 }
 if(wantsOrder){
   if(!product && nmsg.match(/^(yes|yeah|yep|this|eta|এটা|হ্যাঁ|হুম|order now|buy now)$/i) && contextProduct?.id) product=products.find(p=>Number(p.id)===Number(contextProduct.id));
   if(!product){
      const cat=categoryName(msg); const list=cat?products.filter(p=>p.category===cat):products.filter(p=>Number(p.stock)>0).slice(0,6);
      return res.json({reply:lang==='bn'?`অবশ্যই ❤️ কোন productটি order করতে চান?\n${list.map((p,i)=>`${i+1}. ${p.name} — ${money(p.price)}`).join('\n')}\n\nProduct-এর নাম লিখুন বা 1/2/3 লিখুন।`:`Absolutely ❤️ Which product would you like to order?\n${list.map((p,i)=>`${i+1}. ${p.name} — ${money(p.price)}`).join('\n')}\n\nType the product name or 1/2/3.`});
   }
   if(Number(product.stock)<=0)return res.json({product,reply:lang==='bn'?`দুঃখিত, **${product.name}** এখন out of stock। চাইলে অন্য ${product.category} product suggest করতে পারি।`:`Sorry, **${product.name}** is currently out of stock. I can suggest another ${product.category} product if you want.`});
   return res.json({orderStart:true,qty,product:{id:product.id,name:product.name,price:Number(product.price),image:product.image,category:product.category},reply:lang==='bn'?`অবশ্যই ❤️ **${product.name}** × **${qty}** order নিচ্ছি। মোট ${money(Number(product.price)*qty)}।\nআপনার **পুরো নাম** লিখুন।`:`Absolutely ❤️ I’ll take the order for **${product.name}** × **${qty}**. Total ${money(Number(product.price)*qty)}.\nPlease enter your **full name**.`});
 }
 if(wantsCategories||categoryName(msg)){
   const cat=categoryName(msg);const list=cat?products.filter(p=>p.category===cat).slice(0,8):products.slice(0,8);
   return res.json({reply:lang==='bn'?`${cat||'এই'} category-তে ${list.length}টি option আছে:\n${list.map(p=>`• ${p.name} — ${money(p.price)}`).join('\n')}`:`There are ${list.length} options in ${cat||'this'} category:\n${list.map(p=>`• ${p.name} — ${money(p.price)}`).join('\n')}`});
 }
 if(process.env.GEMINI_API_KEY){
   try{
     const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
     const catalog=products.slice(0,40).map(p=>`${p.id}. ${p.name} | ${p.category} | BDT ${p.price} | rating ${p.rating||0} | reviews ${p.reviews||0} | stock ${p.stock||0} | ${p.description||''}`).join('\n');
     const prompt=`You are MAHEER STORE's premium ecommerce chat assistant for Bangladesh. Reply naturally like a helpful human store representative, but never claim to be human. Language: ${lang==='bn'?'Bangla, with English product names where useful':'English'}. You can discuss beauty/personal-care products, shopping, delivery, customer support and order tracking. Use ONLY the live catalog and store facts below; never invent ingredients, medical claims, discounts, stock, policies or delivery times. If the customer wants to order, do NOT pretend the order is placed: ask for the product/quantity and let the website order flow collect name, phone and address. Keep replies concise and friendly.\nSTORE FACTS: Free delivery across Bangladesh; Free Consultation; 24 Hour Service; 100% authentic products. Phone: ${liveSettings.phone||''}.\nCATALOG:\n${catalog}\nRECENT CHAT:\n${history.map(x=>`${x.role}: ${x.text}`).join('\n')}\nCUSTOMER: ${msg}`;
     const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.45,maxOutputTokens:350}})});
     const j=await r.json();const reply=j.candidates?.[0]?.content?.parts?.[0]?.text;
     if(reply)return res.json({reply,provider:'gemini'});
   }catch(e){console.error('Gemini chat fallback:',e.message)}
 }
 return res.json({reply:lang==='bn'?'আমি অবশ্যই সাহায্য করতে পারি ❤️ Product-এর নাম, দাম, rating/review, delivery, category, order বা tracking নিয়ে লিখুন। যেমন: “serum দেখাও”, “এইটা কত?”, “আমি order করতে চাই”, “MH1234567890 track করো”।':'I can help ❤️ Ask me about a product, price, rating/reviews, delivery, categories, ordering or tracking. Examples: “show serum”, “how much is this?”, “I want to order”, or “track MH1234567890”.'});
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
