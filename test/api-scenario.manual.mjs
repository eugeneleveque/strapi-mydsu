/**
 * Scénario de recette de l'API (likes, matchs, messages, réservations, sécurité).
 *
 * Prérequis : un Strapi lancé sur une base de test vide, ex.
 *   DATABASE_CLIENT=sqlite DATABASE_FILENAME=.tmp/p0-test.db PORT=1338 npm run develop
 * Puis :
 *   node test/api-scenario.manual.mjs
 *
 * Ces vérifications seront reprises en tests d'intégration automatisés (P2).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = (process.env.STRAPI_URL || 'http://localhost:1338') + '/api';
const db = new Database(path.join(ROOT, process.env.DATABASE_FILENAME || '.tmp/p0-test.db'));
const now=Date.now();
db.prepare("insert into activities (document_id,title,max_participants,published_at,created_at,updated_at) values ('act1doc','Escape game',3,?,?,?)").run(now,now,now);
const actId=db.prepare("select id from activities where document_id='act1doc'").get().id;
let ok=0,ko=0;
const check=(name,cond,extra='')=>{ if(cond){ok++;console.log('✅',name)} else {ko++;console.log('❌',name,extra)} };
const req=async(method,path,token,body)=>{const r=await fetch(B+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});let j=null;try{j=await r.json()}catch{}return {s:r.status,j}};
const reg=async(n)=>{const r=await req('POST','/auth/local/register',null,{username:n,email:n+'@t.fr',password:'secret123'});return {jwt:r.j.jwt,id:r.j.user.id}};
const a=await reg('alice'),b=await reg('bob'),c=await reg('carol');

// Users
let r=await req('PUT',`/users/${b.id}`,a.jwt,{bio:'hacked'}); check('alice ne peut pas modifier bob',r.s===403,r.s);
r=await req('PUT',`/users/${a.id}`,a.jwt,{bio:'Salut',city:'Nantes',role:1,confirmed:true}); check('alice modifie son profil',r.s===200&&r.j.bio==='Salut',JSON.stringify(r.j));
r=await req('GET',`/users?populate=*`,a.jwt); const bobPub=r.j.find(u=>u.id===b.id); check('profils des autres sans email/relations',r.s===200&&bobPub&&!('email' in bobPub)&&!('sentMessages' in bobPub),JSON.stringify(bobPub));
r=await req('GET',`/users?filters[email][$contains]=bob`,a.jwt); check('filtre email ignoré',r.s===200&&r.j.length===3,r.j?.length);
r=await req('GET',`/users/me`,a.jwt); check('/users/me complet',r.s===200&&r.j.email==='alice@t.fr');
r=await req('DELETE',`/users/${b.id}`,a.jwt); check('alice ne peut pas supprimer bob',r.s===403,r.s);
r=await req('GET',`/users`,null); check('public ne liste pas les users',r.s===403,r.s);

// Likes
r=await req('POST','/likes',a.jwt,{data:{fromUser:c.id,toUser:b.id}}); check('like créé (fromUser forcé)',r.s===201&&r.j.meta.matched===false,JSON.stringify(r.j));
r=await req('POST','/likes',a.jwt,{data:{toUser:a.id}}); check('auto-like refusé',r.s===400,r.s);
r=await req('POST','/likes',null,{data:{toUser:a.id}}); check('like sans auth refusé',r.s===403||r.s===401,r.s);
r=await req('GET','/likes?populate=*',c.jwt); check("carol ne voit pas le like d'alice",r.s===200&&r.j.data.length===0,JSON.stringify(r.j));
r=await req('GET',`/likes?populate=*`,b.jwt); check('bob voit le like reçu, venant d’alice',r.j.data.length===1&&r.j.data[0].fromUser.id===a.id,JSON.stringify(r.j));
r=await req('POST','/likes',b.jwt,{data:{toUser:a.id}}); check('like réciproque => match',r.s===201&&r.j.meta.matched===true&&r.j.data.state==='accepted',JSON.stringify(r.j));
r=await req('POST','/likes',b.jwt,{data:{toUser:a.id}}); check('like idempotent',r.s===201);
r=await req('GET',`/matches?populate=*`,a.jwt); const match=r.j.data[0]; check('alice voit 1 match publié',r.j.data.length===1,JSON.stringify(r.j));
r=await req('GET',`/matches`,c.jwt); check('carol ne voit aucun match',r.j.data.length===0);
r=await req('GET',`/matches/${match.documentId}`,c.jwt); check('carol ne lit pas le match par id',r.s===404,r.s);
r=await req('POST',`/matches`,a.jwt,{data:{user1:a.id,user2:c.id}}); check('création manuelle de match impossible',r.s===405||r.s===404||r.s===403,r.s);
const likesDb=db.prepare('select count(*) n from likes').get().n; check('pas de doublon de like en base (2 docs x2 versions)',likesDb===4,likesDb);

// Messages
r=await req('POST','/messages',a.jwt,{data:{content:'Hello',sender:c.id,recipient:b.id}}); const msg=r.j?.data; check('message à un match (sender forcé)',r.s===201,JSON.stringify(r.j));
r=await req('POST','/messages',a.jwt,{data:{content:'Hey',recipient:c.id}}); check('message à un non-match refusé',r.s===403,r.s);
r=await req('GET','/messages?populate=*',c.jwt); check('carol ne lit pas les messages',r.j.data.length===0);
r=await req('GET','/messages?populate=*',b.jwt); check('bob lit le message, sender=alice',r.j.data.length===1&&r.j.data[0].sender.id===a.id,JSON.stringify(r.j));
r=await req('PUT',`/messages/${msg.documentId}`,a.jwt,{data:{isRead:true}}); check('l’expéditeur ne peut pas marquer lu',r.s===404,r.s);
r=await req('PUT',`/messages/${msg.documentId}`,b.jwt,{data:{isRead:true,content:'modifié'}}); check('destinataire marque lu (contenu inchangé)',r.s===200&&r.j.data.isRead===true&&r.j.data.content==='Hello',JSON.stringify(r.j));

// Bookings (format envoyé par l'app)
r=await req('POST','/bookings',a.jwt,{data:{activity:'act1doc',organizer:c.id,participants:[b.id],date:'2026-10-01',time:'18:30',state:'confirmed'}}); const bk=r.j?.data; check('réservation créée (organizer forcé, état pending, activityName)',r.s===201&&bk.state==='pending'&&bk.activityName==='Escape game'&&bk.date==='2026-10-01',JSON.stringify(r.j));
r=await req('POST','/bookings',b.jwt,{data:{activity:actId,participants:[a.id]}}); check('2e réservation sur la même activité (id numérique)',r.s===201,JSON.stringify(r.j));
r=await req('POST','/bookings',a.jwt,{data:{activity:'act1doc',participants:[c.id]}}); check('inviter un non-match refusé',r.s===403,r.s);
r=await req('POST','/bookings',a.jwt,{data:{activity:'act1doc',participants:[b.id],date:'01/10/2026'}}); check('date invalide refusée',r.s===400,r.s);
r=await req('GET',`/bookings?populate=*`,b.jwt); check('bob (participant) voit ses 2 réservations',r.j.data.length===2,JSON.stringify(r.j.data?.length));
r=await req('GET',`/bookings`,c.jwt); check('carol ne voit rien',r.j.data.length===0);
r=await req('PUT',`/bookings/${bk.documentId}`,b.jwt,{data:{state:'cancelled'}}); check('participant ne peut pas modifier',r.s===404,r.s);
r=await req('PUT',`/bookings/${bk.documentId}`,a.jwt,{data:{state:'confirmed',time:'19:00'}}); check('organisateur confirme',r.s===200&&r.j.data.state==='confirmed'&&r.j.data.activityName==='Escape game',JSON.stringify(r.j));
r=await req('PUT',`/bookings/${bk.documentId}`,a.jwt,{data:{state:'pending'}}); check('transition confirmed→pending refusée',r.s===400,r.s);
r=await req('GET',`/activities?populate=*`,null); check('activités publiques lisibles',r.s===200&&r.j.data.length===1,r.s);
r=await req('GET',`/activities?populate=*`,a.jwt); check('réservations non exposées via les activités',!JSON.stringify(r.j).includes('bookings'),JSON.stringify(r.j).slice(0,200));
r=await req('POST',`/activities`,a.jwt,{data:{title:'x'}}); check('création d’activité via API impossible',r.s!==201,r.s);

// Unmatch
r=await req('DELETE',`/matches/${match.documentId}`,c.jwt); check('carol ne peut pas supprimer le match',r.s===404,r.s);
r=await req('DELETE',`/matches/${match.documentId}`,b.jwt); check('bob peut unmatch',r.s===200||r.s===204,r.s);
console.log(`\n${ok} OK / ${ko} KO`);
