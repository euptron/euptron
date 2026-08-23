const GITHUB_USER = 'euptron';
const NOTES_JSON_URL = 'https://raw.githubusercontent.com/euptron/euptron/notes-dist/notes.json';
const THEME_STORAGE_KEY = 'euptron-theme';
let SITE_DATA = null;

// ---------------- theme ----------------
(function initTheme(){
  const root = document.documentElement;
  let saved = null;
  try{
    saved = localStorage.getItem(THEME_STORAGE_KEY);
  } catch(err){
    saved = null;
  }
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = saved === 'light' || saved === 'dark' ? saved : (prefersLight ? 'light' : 'dark');
  root.setAttribute('data-theme', theme);
})();

function wireThemeToggle(){
  const btn = document.getElementById('theme-toggle');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try{
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch(err){
      // Theme still applies for this page when storage is unavailable.
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  });
}

// ---------------- reduced motion ----------------
function applyMotionPref(){
  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function apply(){
    document.body.classList.toggle('reduced-motion', reduceMotionQuery.matches);
    const d = document.getElementById('cursor-dot');
    const r = document.getElementById('cursor-ring');
    if(reduceMotionQuery.matches){
      if(d) d.style.display = 'none';
      if(r) r.style.display = 'none';
    }
  }
  apply();
  reduceMotionQuery.addEventListener('change', apply);
}

// ---------------- nav active state + trace ----------------
function initNav(){
  const navLinks = document.querySelectorAll('nav a');
  const traceEl = document.getElementById('nav-trace');
  const current = document.body.dataset.page === 'blog-post' ? 'notes' : document.body.dataset.page;

  navLinks.forEach(a => a.classList.toggle('active', a.dataset.page === current));

  function positionTrace(){
    if(!traceEl || window.innerWidth <= 980) return;
    const activeLink = document.querySelector('nav a.active');
    if(!activeLink) return;
    const navRect = document.getElementById('nav').getBoundingClientRect();
    const r = activeLink.getBoundingClientRect();
    traceEl.style.left = (r.left - navRect.left) + 'px';
    traceEl.style.width = r.width + 'px';
  }
  positionTrace();
  window.addEventListener('resize', positionTrace);
  window.addEventListener('load', positionTrace);

  const navToggle = document.getElementById('navToggle');
  const navEl = document.getElementById('nav');
  if(navToggle && navEl){
    navToggle.addEventListener('click', ()=> {
      const isOpen = navEl.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }

  // page-transition wipe on nav clicks that leave the page
  const wipe = document.getElementById('wipe');
  navLinks.forEach(a=>{
    a.addEventListener('click', (e)=>{
      const href = a.getAttribute('href');
      if(!href || href.startsWith('#') || a.dataset.page === current) return;
      e.preventDefault();
      if(wipe){
        wipe.classList.remove('run'); void wipe.offsetWidth; wipe.classList.add('run');
        setTimeout(()=>{ window.location.href = href; }, 320);
      } else {
        window.location.href = href;
      }
    });
  });
}

// ---------------- reveal on scroll ----------------
let io;
function initReveal(){
  io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('is-visible');
        if(e.target.querySelector && e.target.querySelector('.bar i')){
          e.target.querySelectorAll('.bar i').forEach(bar=>{
            bar.style.width = bar.dataset.width + '%';
          });
        }
      }
    });
  },{ threshold:0.2 });
  document.querySelectorAll('.reveal, .tl-item').forEach(el => io.observe(el));
}

// ---------------- typewriter (home only) ----------------
const phrases = ['Etido Peter','CS undergraduate.','open-source contributor.', 'turning ideas into solutions.'];
function runTypewriter(){
  const el = document.getElementById('typewriter');
  if(!el) return;
  let twIndex=0, twChar=0, twDeleting=false;
  el.textContent = '';
  tick();
  function tick(){
    const full = phrases[twIndex];
    if(!twDeleting){
      twChar++;
      el.textContent = full.slice(0,twChar);
      if(twChar===full.length){ twDeleting=true; setTimeout(tick,1300); return; }
    } else {
      twChar--;
      el.textContent = full.slice(0,twChar);
      if(twChar===0){ twDeleting=false; twIndex=(twIndex+1)%phrases.length; }
    }
    setTimeout(tick, twDeleting ? 40 : 65);
  }
}

// ---------------- custom cursor + magnetic buttons (global) ----------------
function initCursorAndMagnet(){
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if(dot && ring){
    let rx=0, ry=0, tx=0, ty=0;
    window.addEventListener('mousemove', (e)=>{
      dot.style.left = e.clientX+'px'; dot.style.top = e.clientY+'px';
      tx = e.clientX; ty = e.clientY;
    });
    (function loop(){
      rx += (tx-rx)*0.18; ry += (ty-ry)*0.18;
      ring.style.left = rx+'px'; ring.style.top = ry+'px';
      requestAnimationFrame(loop);
    })();
    document.querySelectorAll('a, button, input, textarea').forEach(el=>{
      el.addEventListener('mouseenter', ()=> document.body.classList.add('cursor-active'));
      el.addEventListener('mouseleave', ()=> document.body.classList.remove('cursor-active'));
    });
  }

  document.body.addEventListener('mousemove', (e)=>{
    document.querySelectorAll('.btn').forEach(btn=>{
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const dist = Math.hypot(e.clientX-cx, e.clientY-cy);
      if(dist < 110){
        const x = e.clientX - cx, y = e.clientY - cy;
        btn.style.transform = `translate(${x*0.12}px, ${y*0.25}px)`;
      } else {
        btn.style.transform = '';
      }
    });
  });
}

// ---------------- shared data load ----------------
async function loadSiteData(){
  if(SITE_DATA) return SITE_DATA;
  try{
    const res = await fetch('data.json');
    SITE_DATA = await res.json();
  } catch(err){
    console.error('Failed to load data.json', err);
    SITE_DATA = { featured_projects: [], timeline: [], notes: [], uses: {} };
  }
  return SITE_DATA;
}

// ================= HOME PAGE =================
// The original euptron.pages.dev site has exactly ONE Featured Project (CodeOps Studio),
// with a small image carousel cycling through its screenshots. We mirror that here,
// then link out to the full Work page (which does the live GitHub repo listing) via a strip below.
async function initHomePage(){
  runTypewriter();
  const data = await loadSiteData();
  renderTestimonialMarquee(data.testimonials || []);
  const project = data.featured_project;
  if(!project) return;

  document.getElementById('featTag').textContent = project.tag;
  document.getElementById('featTitle').textContent = project.title;
  document.getElementById('featText').textContent = project.text;
  document.getElementById('featMeta').textContent = project.meta;
  document.getElementById('featRepo').href = project.repo;
  const demoLink = document.getElementById('featDemo');
  if(project.demo){
    demoLink.href = project.demo;
  } else {
    demoLink.remove();
  }

  const images = project.images || [];
  let imgIndex = 0;
  const track = document.getElementById('carouselTrack');
  const dots = document.getElementById('carouselDots');

  function renderSlides(){
    if(!images.length){
      track.innerHTML = `<div class="carousel-slide"><div class="media-fallback">${project.title}</div></div>`;
      dots.innerHTML = '';
      return;
    }
    track.innerHTML = images.map(img => `
      <div class="carousel-slide">
        <img src="${img.src}" alt="${project.title} — ${img.caption}" loading="lazy"
             onerror="this.parentElement.innerHTML='<div class=&quot;media-fallback&quot;>Preview unavailable</div>'">
        <div class="carousel-caption">${img.caption}</div>
      </div>`).join('');
    dots.innerHTML = images.map((_,i)=>`<button data-i="${i}" aria-label="Go to image ${i+1}" class="${i===imgIndex?'active':''}"></button>`).join('');
    dots.querySelectorAll('button').forEach(b=>{
      b.addEventListener('click', ()=>{ imgIndex = +b.dataset.i; update(); resetAuto(); });
    });
    update();
  }

  function update(){
    if(!images.length) return;
    track.style.transform = `translateX(-${imgIndex*100}%)`;
    document.querySelectorAll('#carouselDots button').forEach((b,i)=> b.classList.toggle('active', i===imgIndex));
  }

  document.getElementById('carPrev').addEventListener('click', ()=>{
    if(!images.length) return;
    imgIndex = (imgIndex - 1 + images.length) % images.length;
    update(); resetAuto();
  });
  document.getElementById('carNext').addEventListener('click', ()=>{
    if(!images.length) return;
    imgIndex = (imgIndex + 1) % images.length;
    update(); resetAuto();
  });

  const carouselEl = document.getElementById('carousel');
  let touchStartX = null;
  carouselEl.addEventListener('touchstart', (e)=>{ touchStartX = e.touches[0].clientX; }, { passive:true });
  carouselEl.addEventListener('touchend', (e)=>{
    if(touchStartX === null || !images.length) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if(Math.abs(dx) > 40){
      if(dx < 0) imgIndex = (imgIndex + 1) % images.length;
      else imgIndex = (imgIndex - 1 + images.length) % images.length;
      update(); resetAuto();
    }
    touchStartX = null;
  }, { passive:true });

  let autoTimer = null;
  let paused = false;
  function startAuto(){
    clearInterval(autoTimer);
    autoTimer = setInterval(()=>{
      if(paused || !images.length) return;
      imgIndex = (imgIndex + 1) % images.length;
      update();
    }, 4500);
  }
  function resetAuto(){ startAuto(); }
  carouselEl.addEventListener('mouseenter', ()=> paused = true);
  carouselEl.addEventListener('mouseleave', ()=> paused = false);
  carouselEl.addEventListener('focusin', ()=> paused = true);
  carouselEl.addEventListener('focusout', ()=> paused = false);

  renderSlides();
  startAuto();
}

// ================= JOURNEY PAGE =================
async function initJourneyPage(){
  const data = await loadSiteData();
  const tlList = document.getElementById('tlList');
  (data.timeline || []).forEach(item=>{
    const div = document.createElement('div');
    div.className = 'tl-item reveal';
    div.innerHTML = `<div class="tl-node"></div><div class="tl-year">${item.year}</div><h3>${item.title}</h3><p>${item.text}</p>`;
    tlList.appendChild(div);
  });
  initReveal();
  setTimeout(drawTrace, 60);
  document.addEventListener('themechange', ()=> setTimeout(drawTrace, 60));
  window.addEventListener('resize', ()=> drawTrace());
}

function drawTrace(){
  const svg = document.getElementById('traceSvg');
  const path = document.getElementById('tracePath');
  if(!svg || !path) return;
  const items = document.querySelectorAll('.tl-item');
  if(!items.length) return;
  const timelineEl = document.querySelector('.timeline');
  const containerRect = timelineEl.getBoundingClientRect();
  const h = timelineEl.offsetHeight;
  svg.setAttribute('viewBox', `0 0 36 ${h}`);
  svg.style.height = h+'px';
  let d = 'M 3 12 ';
  items.forEach((it)=>{
    const r = it.querySelector('.tl-node').getBoundingClientRect();
    const y = r.top - containerRect.top + r.height/2;
    d += `L 3 ${y} `;
  });
  path.setAttribute('d', d);
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  path.getBoundingClientRect();
  path.style.transition = 'stroke-dashoffset 1.8s cubic-bezier(.2,.7,.3,1)';
  path.style.strokeDashoffset = 0;
  path.classList.add('drawn');
}

function allocateLanguagePercentages(rankedLanguages, totalBytes){
  const allocations = rankedLanguages.map(([language, bytes]) => {
    const hundredths = (bytes / totalBytes) * 10000;
    const wholeHundredths = Math.floor(hundredths);
    return { language, wholeHundredths, remainder: hundredths - wholeHundredths };
  });
  const remainderCount = 10000 - allocations.reduce((sum, item) => sum + item.wholeHundredths, 0);
  allocations.sort((a, b) => b.remainder - a.remainder);
  allocations.slice(0, remainderCount).forEach(item => { item.wholeHundredths += 1; });
  return new Map(allocations.map(item => [item.language, (item.wholeHundredths / 100).toFixed(2)]));
}

// ================= ABOUT PAGE =================
async function initAboutPage(){
  const data = await loadSiteData();
  const languageStatus = document.getElementById('languageStatus');
  const languageTop = document.getElementById('languageTop');
  const languageGrid = document.getElementById('languageGrid');
  const languageReposUrl = `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100`;

  try{
    const reposResponse = await fetch(languageReposUrl, { headers:{ 'Accept':'application/vnd.github+json' } });
    if(!reposResponse.ok) throw new Error('GitHub API error ' + reposResponse.status);
    const repos = (await reposResponse.json()).filter(repo => !repo.fork);
    const languageResponses = await Promise.all(repos.map(repo =>
      fetch(repo.languages_url, { headers:{ 'Accept':'application/vnd.github+json' } })
        .then(response => response.ok ? response.json() : {})
        .catch(() => ({}))
    ));
    const totals = {};
    languageResponses.forEach(languages => {
      Object.entries(languages).forEach(([language, bytes]) => {
        totals[language] = (totals[language] || 0) + bytes;
      });
    });
    const rankedLanguages = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if(!rankedLanguages.length) throw new Error('No language data available');

    const totalBytes = rankedLanguages.reduce((sum, [, bytes]) => sum + bytes, 0);
    const percentages = allocateLanguagePercentages(rankedLanguages, totalBytes);
    const [topLanguage, topBytes] = rankedLanguages[0];
    const topPercent = percentages.get(topLanguage);
    languageStatus.remove();
    languageTop.innerHTML = `<div class="language-top-label"><span>${topLanguage}</span><strong>${topPercent}%</strong></div><div class="language-bar"><i style="width:${topPercent}%"></i></div>`;
    languageGrid.innerHTML = rankedLanguages.slice(0, 8).map(([language]) => {
      const percent = percentages.get(language);
      return `<div class="language-item"><span>${language}</span><strong>${percent}%</strong></div>`;
    }).join('');
  } catch(err){
    languageStatus.innerHTML = 'Language data is unavailable right now. View the repositories on <a href="https://github.com/euptron?tab=repositories" target="_blank" rel="noopener">GitHub ↗</a>.';
    console.error(err);
  }

  renderUses(document.getElementById('usesAccordion'), data.uses || {});
}

function renderTestimonialMarquee(testimonials){
  const rows = [document.getElementById('testimonialRowTop'), document.getElementById('testimonialRowBottom')];
  if(!testimonials.length || rows.some(row => !row)) return;
  const avatarUrl = 'favicon.svg';
  const dialog = document.getElementById('testimonialDialog');
  const dialogMessage = document.getElementById('testimonialDialogMessage');
  const dialogLink = document.getElementById('testimonialDialogLink');
  const closeDialog = () => dialog?.close();
  const isReferenceUrl = url => {
    try{
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch(err){
      return false;
    }
  };

  document.getElementById('testimonialDialogClose')?.addEventListener('click', closeDialog);
  document.getElementById('testimonialDialogCancel')?.addEventListener('click', closeDialog);

  rows.forEach((row, index) => {
    const rowTestimonials = index === 0 ? testimonials : [...testimonials].reverse();
    const cardMarkup = rowTestimonials.map(testimonial => `
      <article class="marquee-card"${isReferenceUrl(testimonial.url) ? ` data-testimonial-index="${testimonials.indexOf(testimonial)}" role="button" tabindex="0"` : ''}>
        <span class="quote-icon" aria-hidden="true">“</span>
        <p>${testimonial.quote}</p>
        <div class="testimonial-author">
          <img src="${testimonial.avatar || avatarUrl}" alt="${testimonial.name}" loading="lazy">
          <span><strong>${testimonial.name}</strong><small>${testimonial.role}</small></span>
        </div>
      </article>
    `).join('');
    const track = document.createElement('div');
    track.className = 'marquee-track';
    const duplicateMarkup = cardMarkup
      .replace(/<article class="marquee-card"[^>]*>/g, '<article class="marquee-card" aria-hidden="true">');
    track.innerHTML = cardMarkup + duplicateMarkup;
    track.querySelectorAll('.marquee-card[role="button"]').forEach(card => {
      const testimonial = testimonials[card.dataset.testimonialIndex];
      const openDialog = () => {
        if(!dialog || !dialogMessage || !dialogLink || !isReferenceUrl(testimonial?.url)) return;
        dialogMessage.textContent = `Would you like to reach out to ${testimonial.name}?`;
        dialogLink.href = testimonial.url;
        dialog.showModal();
      };
      card.addEventListener('click', openDialog);
      card.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === ' '){
          event.preventDefault();
          openDialog();
        }
      });
    });
    row.appendChild(track);
  });
}

// ================= WORK PAGE =================
async function initWorkPage(){
  const workGrid = document.getElementById('workGrid');
  const filtersEl = document.getElementById('filters');
  const workStatusEl = document.getElementById('workStatus');
  let repoData = [];
  let activeFilter = 'All';

  function tiltCard(e){
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left)/r.width - 0.5;
    const y = (e.clientY - r.top)/r.height - 0.5;
    c.style.transform = `perspective(600px) rotateX(${y*-6}deg) rotateY(${x*6}deg) translateY(-2px)`;
  }

  function renderFilters(){
    filtersEl.innerHTML = '';
    const langs = ['All', ...new Set(repoData.map(r=>r.language).filter(Boolean))];
    langs.forEach((c)=>{
      const b = document.createElement('button');
      b.className = 'filter-btn' + (c===activeFilter?' active':'');
      b.textContent = c;
      b.addEventListener('click', ()=>{
        activeFilter = c;
        filtersEl.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        renderWorkGrid();
      });
      filtersEl.appendChild(b);
    });
  }

  function renderWorkGrid(){
    workGrid.innerHTML = '';
    const filtered = activeFilter==='All' ? repoData : repoData.filter(r=>r.language===activeFilter);
    if(!filtered.length){
      workGrid.innerHTML = '<p style="font-family:var(--mono);color:var(--ink-faint);">No repositories found for this filter.</p>';
      return;
    }
    filtered.forEach((repo)=>{
      const c = document.createElement('div');
      c.className = 'card';
      c.style.cursor = 'pointer';
      c.innerHTML = `<span class="card-tag">${repo.language || 'Project'}</span><h3>${repo.name}</h3><p>${repo.description || 'No description provided.'}</p>
        <div class="card-foot"><span>★ ${repo.stargazers_count} · updated ${new Date(repo.updated_at).toLocaleDateString()}</span><a href="${repo.html_url}" target="_blank" rel="noopener">View →</a></div>`;
      c.addEventListener('mousemove', tiltCard);
      c.addEventListener('mouseleave', ()=>{ c.style.transform=''; });
      c.addEventListener('click', (e)=>{ if(e.target.tagName === 'A') return; openModal(repo); });
      workGrid.appendChild(c);
    });
  }

  async function loadRepos(){
    try{
      const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?sort=updated&per_page=100`, { headers:{ 'Accept':'application/vnd.github+json' } });
      if(!res.ok) throw new Error('GitHub API error ' + res.status);
      const all = await res.json();
      repoData = all.filter(r=>!r.fork).sort((a,b)=> new Date(b.updated_at)-new Date(a.updated_at));
      workStatusEl.style.display = 'none';
      renderFilters();
      renderWorkGrid();
    } catch(err){
      workStatusEl.innerHTML = `Couldn't reach the GitHub API right now — <a href="https://github.com/${GITHUB_USER}" target="_blank" rel="noopener" style="color:var(--accent);">view the profile directly ↗</a>`;
      console.error(err);
    }
  }

  const modalOverlay = document.getElementById('modalOverlay');
  function openModal(repo){
    document.getElementById('modalTag').textContent = repo.language || 'Project';
    document.getElementById('modalTitle').textContent = repo.name;
    document.getElementById('modalDetail').textContent = repo.description || 'No description provided.';
    document.getElementById('modalMeta').textContent = `★ ${repo.stargazers_count} · forks ${repo.forks_count} · updated ${new Date(repo.updated_at).toLocaleDateString()}`;
    document.getElementById('modalStack').innerHTML = repo.topics && repo.topics.length
      ? repo.topics.map(t=>`<span>${t}</span>`).join('')
      : (repo.language ? `<span>${repo.language}</span>` : '');
    document.getElementById('modalLink').href = repo.html_url;
    modalOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    modalOverlay.classList.remove('show');
    document.body.style.overflow = '';
  }
  document.getElementById('modalClose').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e)=>{ if(e.target===modalOverlay) closeModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeModal(); });

  loadRepos();
}

// ================= USES CONTENT =================
function renderUses(container, uses){

  function notedListHTML(items){
    return `<div class="uses-list">${items.map(i => `<div class="uses-item"><span class="u-name">${i.name}</span><span class="u-note">${i.note || ''}</span></div>`).join('')}</div>`;
  }
  function simpleListHTML(items){
    return `<div class="uses-list">${items.map(i => `<div class="uses-item"><span class="u-name">${i}</span></div>`).join('')}</div>`;
  }

  const sections = [
    { key:'hardware', label:'Hardware', items: uses.hardware || [], noted:true },
    { key:'languages', label:'Languages', items: uses.languages || [], noted:false },
    { key:'tools', label:'Tools & Platforms', items: uses.tools || [], noted:true },
    { key:'misc', label:'Miscellaneous', items: uses.misc || [], noted:false }
  ];

  container.innerHTML = sections.map((s, idx) => `
    <div class="accordion-item${idx===0 ? ' open' : ''}" data-key="${s.key}">
      <button class="accordion-trigger" aria-expanded="${idx===0}">
        <span class="acc-label"><span class="acc-sign">${idx===0 ? '−' : '+'}</span>${s.label.toUpperCase()}</span>
        <span class="acc-count">${s.items.length} item${s.items.length===1?'':'s'}</span>
      </button>
      <div class="accordion-panel">
        <div class="accordion-body">${s.noted ? notedListHTML(s.items) : simpleListHTML(s.items)}</div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.accordion-item').forEach(item=>{
    const trigger = item.querySelector('.accordion-trigger');
    const sign = item.querySelector('.acc-sign');
    trigger.addEventListener('click', ()=>{
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
      sign.textContent = !isOpen ? '−' : '+';
    });
  });
}

// ================= RESUME PAGE =================
async function initResumePage(){
  const data = await loadSiteData();
  const resume = data.resume || {};

  const headEl = document.getElementById('resumeHeadline');
  if(headEl) headEl.textContent = resume.headline || '';
  const sumEl = document.getElementById('resumeSummary');
  if(sumEl) sumEl.textContent = resume.summary || '';
  const pdfLink = document.getElementById('resumePdfLink');
  if(pdfLink && resume.pdf_url) pdfLink.href = resume.pdf_url;

  const expEl = document.getElementById('resumeExperience');
  if(expEl){
    expEl.innerHTML = (resume.experience || []).map(e => `
      <div class="resume-entry">
        <div class="resume-entry-head"><strong>${e.role}</strong><span>${e.period}</span></div>
        <span class="org">${e.org}</span>
        <p>${e.text}</p>
      </div>
    `).join('');
  }

  const eduEl = document.getElementById('resumeEducation');
  if(eduEl){
    eduEl.innerHTML = (resume.education || []).map(e => `
      <div class="resume-entry">
        <div class="resume-entry-head"><strong>${e.school}</strong><span>${e.period}</span></div>
        <p>${e.text}</p>
      </div>
    `).join('');
  }
}

// ================= NOTES PIPELINE (remote markdown feed) =================
// Posts come exclusively from the euptron/euptron repo: GitHub Actions
// compiles notes/*.md (with Git-history timestamps) into a notes.json
// published on the `notes-dist` branch.

function formatPostDate(value){
  if(!value) return '';
  const parsed = new Date(value);
  return isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
}

async function loadWritingPosts(){
  try{
    const res = await fetch(NOTES_JSON_URL, { cache: 'no-store' });
    if(res.ok){
      const payload = await res.json();
      return (payload.posts || [])
        .map(p => ({
          slug: p.slug,
          date: p.updated || p.created,
          created: p.created,
          updated: p.updated,
          title: p.title,
          excerpt: p.summary || '',
          body: p.content || '',
          tags: Array.isArray(p.tags) ? p.tags : []
        }))
        .filter(p => p.title && p.body);
    }
  } catch(err){
    console.warn('Remote notes feed unavailable.', err);
  }
  return [];
}

function renderMarkdown(markdown){
  if(window.marked && window.DOMPurify){
    marked.setOptions({ gfm: true, breaks: false });
    return DOMPurify.sanitize(marked.parse(markdown));
  }
  const escapeHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return '<p>' + escapeHtml(markdown).split('\n\n').join('</p><p>') + '</p>';
}

// ================= NOTES LISTING PAGE =================
async function initNotesPage(){
  const grid = document.getElementById('blogGrid');
  if(!grid) return;
  const posts = await loadWritingPosts();
  if(!posts.length){
    grid.innerHTML = '<p class="no-notes">Notes are syncing from the pipeline — check back shortly.</p>';
    return;
  }

  function render(filter=''){
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? posts.filter(p => (p.title + ' ' + p.excerpt + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(f))
      : posts;
    if(!filtered.length){
      grid.innerHTML = '<p class="no-notes">No posts found matching your search.</p>';
      return;
    }
    grid.innerHTML = filtered.map(p => `
      <a class="blog-card" href="blog-post.html?slug=${encodeURIComponent(p.slug)}">
        <span class="b-date">${formatPostDate(p.date)}</span>
        <h3>${p.title}</h3>
        <p>${p.excerpt}</p>
        ${(p.tags && p.tags.length) ? `<div class="tag-cloud b-tags">${p.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>` : ''}
        <span class="b-readmore">Read more →</span>
      </a>
    `).join('');
  }
  render();
  const search = document.getElementById('blog-search');
  if(search) search.addEventListener('input', (e)=> render(e.target.value));
}

// ================= WRITING DETAIL PAGE =================
async function initBlogPostPage(){
  const container = document.getElementById('blogPostContent');
  if(!container) return;
  const posts = await loadWritingPosts();
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const post = posts.find(p => p.slug === slug) || posts[0];
  if(!post){
    container.innerHTML = '<p>Post not found.</p>';
    return;
  }
  container.innerHTML = `
    <div class="blog-post-head">
      <p class="eyebrow">${formatPostDate(post.date)}</p>
      <h1 style="font-size:clamp(28px,5vw,44px);line-height:1.15;">${post.title}</h1>
      ${post.excerpt ? `<p class="blog-post-lede">${post.excerpt}</p>` : ''}
    </div>
    <div class="blog-post-body markdown-body">${renderMarkdown(post.body)}</div>
  `;
  document.title = post.title + ' — EUPTRON';
  const canonicalHref = `https://euptron.pages.dev/blog-post.html?slug=${encodeURIComponent(post.slug)}`;
  const canonical = document.querySelector('link[rel="canonical"]');
  if(canonical) canonical.href = canonicalHref;
  const description = document.querySelector('meta[name="description"]');
  if(description) description.content = post.excerpt;
  document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach(meta => { meta.content = document.title; });
  document.querySelectorAll('meta[property="og:description"], meta[name="twitter:description"]').forEach(meta => { meta.content = post.excerpt; });
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if(ogUrl) ogUrl.content = canonicalHref;
}

// ================= CONTACT PAGE =================
function initContactPage(){
  const form = document.getElementById('contactForm');
  if(!form) return;
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = document.getElementById('cname').value;
    const email = document.getElementById('cemail').value;
    const msg = document.getElementById('cmsg').value;
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(()=> toast.classList.remove('show'), 3200);
    const subject = encodeURIComponent('Inquiry from EUPTRON Portfolio');
    const body = encodeURIComponent(`${msg}\n\n— ${name} (${email})`);
    setTimeout(()=>{ window.location.href = `mailto:euptron@gmail.com?subject=${subject}&body=${body}`; }, 500);
  });
}

// ================= GLOBAL INIT =================
function autoFooterYear(){
  const year = String(new Date().getFullYear());
  document.querySelectorAll('footer').forEach(footer => {
    footer.textContent = footer.textContent.replace(/\u00A9\s*\d{4}/, '\u00A9 ' + year);
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  autoFooterYear();
  wireThemeToggle();
  applyMotionPref();
  initNav();
  initCursorAndMagnet();
  initReveal();

  const page = document.body.dataset.page;
  if(page === 'home') initHomePage();
  if(page === 'about') initAboutPage();
  if(page === 'journey') initJourneyPage();
  if(page === 'work') initWorkPage();
  if(page === 'notes') initNotesPage();
  if(page === 'contact') initContactPage();
  if(page === 'resume') initResumePage();
  if(page === 'blog-post') initBlogPostPage();
});
