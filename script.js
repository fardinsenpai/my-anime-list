window.onload = () => {
  const duration = 8500; // ৭ সেকেন্ডে সব শেষ হবে
  const boxes = document.querySelectorAll(".counter-box");

  // Fade + Slide animation trigger
  boxes.forEach((box, index) => {
    setTimeout(() => {
      box.classList.add("show");
    }, index * 200); // staggered entry (optional)
  });

  // Counter start
  counterUp("animeCount", 236, duration);
  counterUp("seasonCount", 347, duration);
  counterUp("episodeCount", 6166, duration);
};

// === TOPBAR MENU & SEARCH ===
const menuBtn = document.getElementById('menuBtn');
const sideMenu = document.getElementById('sideMenu');
const menuOverlay = document.getElementById('menuOverlay');
const topSearchBtn = document.getElementById('topSearchBtn');

function openMenu() {
  if(sideMenu) sideMenu.classList.add('open');
  if(menuOverlay) menuOverlay.classList.add('open');
}
function closeMenu() {
  if(sideMenu) sideMenu.classList.remove('open');
  if(menuOverlay) menuOverlay.classList.remove('open');
}

if(menuBtn) {
  menuBtn.onclick = () => {
    sideMenu && sideMenu.classList.contains('open') ? closeMenu() : openMenu();
  };
}

if(topSearchBtn) {
  topSearchBtn.onclick = (e) => {
    e.preventDefault();
    const box = document.getElementById('searchBox');
    if(box) {
      const topOffset = 80;
      const elementPosition = box.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - topOffset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      
      setTimeout(()=>box.focus(), 500);
    }
  };
}

if(menuOverlay) menuOverlay.onclick = closeMenu;

// === ১. ডাটা ও অর্ডার (আগের মতোই রাখা হয়েছে) ===
const TOP_5_DATA = {
  "Action": [3, 6, 1, 5, 10],
  "Adventure": [4, 7, 17, 24, 55],
  "Isekai": [105, 99, 76, 135, 181],
  "Comedy": [221, 19, 191, 123, 219],
  "Sports": [21, 9, 202, 186, 8],
  "Romcom": [109, 219, 41, 103, 56],
  "Sci-Fi": [26, 76, 164, 73, 220],
  "Historical": [13, 92, 49, 24, 86],
  "Dark / Horror": [29, 205, 12, 53, 217],
  "Slice of Life": [223, 20, 113, 47, 156],
  "Psychological": [12, 31, 95, 47, 68],
  "Movie": [38, 39, 81, 122, 48]
};

// === ২. মেইন ফিল্টার ফাংশন (টাইটেল আপডেট ও সাইজ কন্ট্রোল) ===
function filterTopFive(genre) {
  const targetIds = TOP_5_DATA[genre]; 
  const grid = document.getElementById('grid');
  const cards = Array.from(document.querySelectorAll('.card'));
  
  const mainTitle = document.querySelector('.header h1');
  const counterSection = document.querySelector('.counter-container');
  const searchSection = document.querySelector('.search-wrap');
  const genreSection = document.querySelector('.filter-section');

  // টাইটেল পরিবর্তন এবং সাইজ ছোট করা
  if (mainTitle) {
    mainTitle.textContent = `Top 5 Picks From ${genre}`;
    mainTitle.style.fontSize = "clamp(1.4rem, 4vw, 2.2rem)"; 
  }

  // সেকশন হাইড করা
  if (counterSection) counterSection.style.display = 'none';
  if (searchSection) searchSection.style.display = 'none';
  if (genreSection) genreSection.style.display = 'none';

  cards.forEach(card => {
    card.classList.add('hidden');
    card.style.display = "none";
  });

  // অর্ডার মেইনটেইন এবং ব্যাজ আপডেট
  targetIds.forEach((id, index) => {
    const matchingCard = cards.find(card => {
      const numEl = card.querySelector('.number');
      return numEl && parseInt(numEl.textContent.replace(/\D/g, '')) === id;
    });

    if (matchingCard) {
      matchingCard.classList.remove('hidden');
      matchingCard.style.display = "block";
      
      const badge = matchingCard.querySelector('.badge');
      if (badge) badge.textContent = `Top-${index + 1}`;
      
      grid.appendChild(matchingCard);
    }
  });

  if (typeof closeMenu === 'function') closeMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === ৩. ড্রপডাউন লজিক এবং রিসেট বাটন ===
document.addEventListener('DOMContentLoaded', () => {
  const dropBtn = document.getElementById('dropBtn');
  const sideDropdown = document.querySelector('.side-dropdown');
  
  // ড্রপডাউন ওপেন/ক্লোজ (এখানে parentElement ব্যবহার করা হয়েছে)
  if (dropBtn && sideDropdown) {
    dropBtn.onclick = function(e) {
      e.preventDefault();
      sideDropdown.classList.toggle('active');
    };
  }

  // Home রিসেট লজিক
  const homeBtn = document.querySelector('.side-nav a[href="#"]');
  if(homeBtn) {
    homeBtn.onclick = (e) => {
      e.preventDefault();
      
      const mainTitle = document.querySelector('.header h1');
      if (mainTitle) {
        mainTitle.textContent = "Let's See What Anime I Have Watched:-";
        mainTitle.style.fontSize = ""; 
      }

      const counterSection = document.querySelector('.counter-container');
      const searchSection = document.querySelector('.search-wrap');
      const genreSection = document.querySelector('.filter-section');
      
      if(counterSection) counterSection.style.display = 'flex';
      if(searchSection) searchSection.style.display = 'flex';
      if(genreSection) genreSection.style.display = 'block';

      const grid = document.getElementById('grid');
      const allCards = Array.from(document.querySelectorAll('.card'));
      allCards.sort((a, b) => {
        const numA = parseInt(a.querySelector('.number').textContent.replace(/\D/g, ''));
        const numB = parseInt(b.querySelector('.number').textContent.replace(/\D/g, ''));
        return numA - numB;
      }).forEach(card => {
        card.classList.remove('hidden');
        card.style.display = "block";
        
        const badge = card.querySelector('.badge');
        const originalNum = card.querySelector('.number').textContent.replace(/\D/g, '');
        if (badge) badge.textContent = `#${originalNum}`;
        
        grid.appendChild(card);
      });
      
      if (typeof closeMenu === 'function') closeMenu();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }
});

window.addEventListener('load', function() {
  const duelScript = document.createElement('script');
  duelScript.src = 'duel-system.js';
  document.body.appendChild(duelScript);
});

// ===============================
// SUGGESTION PANEL
// ===============================

const suggestionPanel = document.getElementById("suggestionPanel");

function openSuggestion() {
  suggestionPanel.classList.add("open");
}

function closeSuggestion() {
  suggestionPanel.classList.remove("open");
}

(function () {
  const GENRES = {
    "All":           { icon: "✦", nums: null },
    "Action":        { icon: "⚔", nums: new Set([1,2,3,4,5,6,7,8,10,11,13,14,15,16,17,19,22,23,24,26,27,28,29,30,32,34,36,37,40,42,43,46,48,49,50,52,55,61,62,63,64,65,66,67,68,69,70,73,74,75,76,78,80,81,85,86,89,90,92,93,94,97,98,99,100,102,104,105,106,107,114,115,116,118,125,126,127,129,130,135,136,137,139,140,141,146,149,152,158,162,165,169,170,173,174,175,179,180,181,184,187,188,190,194,195,198,199,201,202,203,205,212,214,218,220,221,225,226,227,228,231,232,234]) },
    "Adventure":     { icon: "🗺", nums: new Set([1,2,3,4,5,6,7,10,13,17,18,25,29,36,37,39,46,62,64,66,76,79,81,93,100,104,105,118,120,126,128,134,135,136,137,143,149,154,155,156,160,161,163,165,167,171,179,181,182,183,188,189,191,206,207,208,209,214,216,224,231,233]) },
    "Comedy":        { icon: "😂", nums: new Set([4,5,7,14,15,19,23,32,33,40,43,56,62,63,65,67,69,70,74,84,85,90,101,105,108,115,117,123,131,133,134,138,139,140,144,148,150,151,154,155,157,162,169,171,175,176,185,186,195,196,197,198,199,201,213,215,219,220,221,222,229]) },
    "Sports":        { icon: "🏆", nums: new Set([8,9,16,21,30,44,94,96,98,110,125,129,132,200,202,235]) },
    "Movie":         { icon: "🎬", nums: new Set([38, 39, 42, 44, 46, 48, 79, 81, 122, 129]) },
    "Isekai":        { icon: "🌀", nums: new Set([18,34,52,63,68,69,82,89,90,93,99,102,105,114,115,117,120,127,128,131,133,134,135,137,139,142,143,149,154,155,160,161,163,165,167,169,170,171,173,174,175,181,184,185,187,189,194,198,199,201,207,208,209,212,214,216,218,222,226,228,232,233,236]) },
    "Dark / Horror": { icon: "💀", nums: new Set([10,11,12,22,24,27,28,29,40,42,47,48,49,50,52,53,65,66,67,68,73,75,76,95,99,100,114,116,130,141,152,158,159,170,172,180,182,184,190,203,205,214,217,225,228,231]) },
    "Romcom":        { icon: "💕", nums: new Set([20,35,38,41,45,51,57,58,59,60,71,72,77,80,82,83,84,85,87,91,103,106,108,109,112,113,122,132,138,142,153,159,162,166,168,177,185,193,197,207,210,211,219,223]) },
    "Slice of Life": { icon: "🌸", nums: new Set([12,19,20,27,31,35,38,39,43,47,51,54,57,58,59,72,77,79,83,88,95,103,109,111,112,113,119,121,122,123,124,133,138,144,145,147,148,150,151,153,156,157,160,161,164,166,168,172,176,177,178,186,189,191,192,193,196,204,206,208,210,213,215,219,222,223,224,230,235]) },
    "Sci-Fi":        { icon: "🚀", nums: new Set([25,26,61,65,71,73,75,78,106,135,141,164,183,213,217,234]) },
    "Historical":    { icon: "📜", nums: new Set([13,24,42,49,77,86,88,92,146,158,168,227]) },
    "Psychological": { icon: "🧠", nums: new Set([12, 29, 31, 47, 53, 68, 73, 95, 152, 205]) },

  };


  const TOTAL = document.querySelectorAll('.card').length;

  function countForGenre(name) {
    const set = GENRES[name].nums;
    if (!set) return TOTAL;
    let c = 0;
    document.querySelectorAll('.card').forEach(card => {
      const n = parseInt((card.querySelector('.number') || {}).textContent?.match(/\d+/)?.[0], 10);
      if (!isNaN(n) && set.has(n)) c++;
    });
    return c;
  }

  function getNum(card) {
    const el = card.querySelector('.number');
    if (!el) return null;
    const m = el.textContent.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  function buildPills() {
    const wrap = document.getElementById('pillsWrap');
    if (!wrap) return;
    Object.entries(GENRES).forEach(([name, g]) => {
      const btn = document.createElement('button');
      btn.className = 'pill' + (name === 'All' ? ' active' : '');
      btn.dataset.genre = name;
      const cnt = countForGenre(name);
      btn.innerHTML = `<span style="font-size:14px">${g.icon}</span>${name}<span class="pill-count">${cnt}</span>`;
      btn.addEventListener('click', () => applyFilter(name));
      wrap.appendChild(btn);
    });
  }

  function applyFilter(name) {
    const set = GENRES[name].nums;
    const cards = document.querySelectorAll('.card');
    let vis = 0;
    cards.forEach(card => {
      const n = getNum(card);
      const show = n !== null && (!set || set.has(n));
      card.classList.toggle('hidden', !show);
      if (show) vis++;
    });
    document.querySelectorAll('.pill').forEach(p =>
      p.classList.toggle('active', p.dataset.genre === name));
    const status = document.getElementById('filterStatus');
    if (status) status.innerHTML = `Showing <strong>${vis}</strong> of <strong>${TOTAL}</strong> anime`;
    const clr = document.getElementById('clearBtn');
    if (clr) clr.classList.toggle('hidden', name === 'All');
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildPills();
    const clr = document.getElementById('clearBtn');
    if (clr) clr.addEventListener('click', () => applyFilter('All'));
  });
})();



const cards = document.querySelectorAll(".card");

function showCardsOnScroll() {
  const triggerBottom = window.innerHeight * 0.85;

  cards.forEach(card => {
    const cardTop = card.getBoundingClientRect().top;
    if(cardTop < triggerBottom) {
      card.classList.add("show");
    }
  });
}

window.addEventListener("scroll", showCardsOnScroll);
window.addEventListener("load", showCardsOnScroll);

    function filterCards(){
      const q=document.getElementById('searchBox').value.toLowerCase();
      document.querySelectorAll('.card').forEach(c=>{
        c.classList.toggle('hidden',!c.querySelector('.title').textContent.toLowerCase().includes(q));
      });
    }

window.onscroll = function() {
    var mainSearch = document.getElementById('searchBox'); // আপনার মেইন সার্চ বক্সের ক্লাস নাম
    var stickySearch = document.getElementById('stickySearch');
    
    // মেইন সার্চ বক্স যখন স্ক্রিন থেকে চলে যাবে তখন স্টিকি বক্স আসবে
    if (window.pageYOffset > mainSearch.offsetTop + mainSearch.offsetHeight) {
        stickySearch.style.display = "block";
    } else {
        stickySearch.style.display = "none";
    }
};

// সার্চ ফাংশন (যাতে দুই বক্সেই কাজ করে)
function filterAnime(value) {
    let searchTerm = value.toLowerCase();
    let cards = document.querySelectorAll('.card');
    
    cards.forEach(card => {
        let title = card.querySelector('.title').innerText.toLowerCase();
        if (title.includes(searchTerm)) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });
}

function counterUp(id, target, duration) {
  let count = 0;
  const element = document.getElementById(id);
  const steps = duration / 20;
  const increment = target / steps;

  const interval = setInterval(() => {
    count += increment;
    if (count >= target) {
      count = target;
      clearInterval(interval);
    }
    element.innerText = Math.floor(count) + "+";
  }, 20);
}
function autoFilter(category) {
    const cards = document.querySelectorAll('.card');
    
    cards.forEach(card => {
        // কার্ডের ভেতরের সিজন/স্ট্যাটাস টেক্সটটি নেওয়া হচ্ছে
        const statusText = card.querySelector('.season').innerText;

        if (category === 'all') {
            card.style.display = "block";
        } 
        else if (category === 'Series') {
            // যদি লেখায় 'Season' বা 'Episodes' থাকে তবে সেটি Series
            if (statusText.includes('Season') || statusText.includes('Episodes')) {
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }
        } 
        else if (category === 'Ongoing') {
            if (statusText.includes('Ongoing')) {
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }
        } 
        else if (category === 'Movie') {
            if (statusText.includes('Movie')) {
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }
        }
    });
}
// script.js

function createSakura() {
    const sakura = document.createElement("div");
    sakura.classList.add("sakura");
    
    // --- ইউনিক প্রপার্টি জেনারেট করা ---

    // ১. পজিশন (র‍্যান্ডম)
    sakura.style.left = Math.random() * 100 + "vw";
    
    // ২. আকার (র‍্যান্ডম - ৫px থেকে ১৫px)
    const size = Math.random() * 10 + 5 + "px";
    sakura.style.width = size;
    sakura.style.height = size;
    
    // ৩. পড়ার সময়কাল (র‍্যান্ডম গতি - ৫s থেকে ১৫s)
    const fallDuration = Math.random() * 10 + 5;
    sakura.style.animationDuration = fallDuration + "s, 4s"; // fall এবং sway এর সময়কাল
    
    // ৪. হালকা অস্বচ্ছতা (Opacity - র‍্যান্ডম ০.৫ থেকে ১.০)
    sakura.style.opacity = Math.random() * 0.5 + 0.5;

    // ৫. দুলার জন্য র‍্যান্ডম বিলম্ব
    sakura.style.animationDelay = Math.random() * 5 + "s";

    document.body.appendChild(sakura);

    // পাপড়ি স্ক্রিনের বাইরে চলে গেলে মুছে ফেলা
    setTimeout(() => {
        sakura.remove();
    }, fallDuration * 1000);
}

// প্রতি ২০০ মিলিসেকেন্ডে একটি নতুন পাপড়ি তৈরি হবে
setInterval(createSakura, 200);

const glow = document.createElement('div');
glow.className = 'cursor-glow';
document.body.appendChild(glow);

document.addEventListener('mousemove', (e) => {
    glow.style.left = e.pageX + 'px';
    glow.style.top = e.pageY + 'px';
});

/* === FARDIN'S OTAKU LIST - PREMIUM SAKURA CHAT JS === */

function toggleSakuraChat() {
  const chatBox = document.getElementById("sakuraChatBox");
  chatBox.classList.toggle("active");
}


// Auto flip back when clicking another card
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', function () {
    
    // Flip back ALL other cards first
    document.querySelectorAll('.card.flipped').forEach(flippedCard => {
      if (flippedCard !== this) {
        flippedCard.classList.remove('flipped');
      }
    });

    // Then toggle current card
    this.classList.toggle('flipped');
  });
});

// Dynamic animation delay for pills
// Add this inside your pill generation code
// Find where you create pills and add this after:

document.querySelectorAll('.pill').forEach((pill, index) => {
  pill.style.animationDelay = `${0.1 + index * 0.05}s`;
});

// Hide counter and genre when searching
const searchBox = document.getElementById('searchBox');
const counterContainer = document.querySelector('.counter-container');
const filterSection = document.querySelector('.filter-section');

searchBox.addEventListener('input', function () {
  const value = this.value.trim();

  if (value.length > 0) {
    // Hide counter and genre when typing
    counterContainer.style.opacity = '0';
    counterContainer.style.transform = 'translateY(-20px)';
    counterContainer.style.pointerEvents = 'none';
    counterContainer.style.height = '0';
    counterContainer.style.overflow = 'hidden';
    counterContainer.style.marginBottom = '0';
    counterContainer.style.transition = 'all 0.4s ease';

    filterSection.style.opacity = '0';
    filterSection.style.transform = 'translateY(-20px)';
    filterSection.style.pointerEvents = 'none';
    filterSection.style.height = '0';
    filterSection.style.overflow = 'hidden';
    filterSection.style.marginBottom = '0';
    filterSection.style.transition = 'all 0.4s ease';

  } else {
    // Show counter and genre when search is empty
    counterContainer.style.opacity = '1';
    counterContainer.style.transform = 'translateY(0)';
    counterContainer.style.pointerEvents = 'auto';
    counterContainer.style.height = '';
    counterContainer.style.overflow = '';
    counterContainer.style.marginBottom = '';
    counterContainer.style.transition = 'all 0.4s ease';

    filterSection.style.opacity = '1';
    filterSection.style.transform = 'translateY(0)';
    filterSection.style.pointerEvents = 'auto';
    filterSection.style.height = '';
    filterSection.style.overflow = '';
    filterSection.style.marginBottom = '';
    filterSection.style.transition = 'all 0.4s ease';
  }
});

function searchAnime() {
    let input = document.getElementById('search-input').value.toLowerCase();
    let cards = document.querySelectorAll('.card');
    let noResults = document.getElementById('no-results');
    let visibleCount = 0;

    cards.forEach(card => {
        let title = card.querySelector('.title').innerText.toLowerCase();
        
        if (title.includes(input)) {
            card.style.display = "block"; // কার্ড দেখাবে
            visibleCount++;
        } else {
            card.style.display = "none";  // কার্ড লুকাবে
        }
    });

    // যদি কোনো কার্ড দৃশ্যমান না থাকে (visibleCount == 0)
    if (visibleCount === 0) {
        noResults.style.display = "block"; // মেসেজ দেখাবে
    } else {
        noResults.style.display = "none";  // মেসেজ লুকাবে
    }
}

cards.forEach((card, i) => {
  setTimeout(() => {
    card.classList.add("show");
  }, i * 80);
});

/* ⚡⚡⚡ LIGHTNING - BLUE & LONGER DURATION ⚡⚡⚡ */

class LightningBolt {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.reset();
  }

  reset() {
    this.x = Math.random() * this.width;
    this.y = 0;
    this.segments = [];
    this.createSegments();
  }

  createSegments() {
    this.segments = [];
    let x = this.x;
    let y = this.y;
    
    for (let i = 0; i < 20; i++) {
      x += (Math.random() - 0.5) * 40;
      y += Math.random() * (this.height / 20);
      this.segments.push({ x, y });
    }
  }

  draw() {
    // ⚡ নীল Lightning (উজ্জ্বল)
    this.ctx.strokeStyle = `rgba(100, 150, 255, 0.95)`; // নীল রঙ
    this.ctx.lineWidth = 4 + Math.random() * 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(this.x, this.y);

    for (let segment of this.segments) {
      this.ctx.lineTo(segment.x, segment.y);
    }

    this.ctx.stroke();

    // ছোট শাখা তৈরি করা
    for (let segment of this.segments) {
      if (Math.random() > 0.7) {
        this.drawBranch(segment.x, segment.y);
      }
    }
  }

  drawBranch(startX, startY) {
    this.ctx.strokeStyle = `rgba(100, 150, 255, 0.7)`; // নীল শাখা
    this.ctx.lineWidth = 2;
    
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);

    let x = startX;
    let y = startY;

    for (let i = 0; i < 5; i++) {
      x += (Math.random() - 0.5) * 30;
      y += Math.random() * 30;
      this.ctx.lineTo(x, y);
    }

    this.ctx.stroke();
  }
}

// Canvas সেটআপ
const canvas = document.getElementById('lightningCanvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let lightningBolt = null;
  let lightningTimeout = null;

  function createLightning() {
    lightningBolt = new LightningBolt(canvas);
    
    // ⏱️ ৫০০ms পর্যন্ত দৃশ্যমান থাকবে (আগে ২০০ms ছিল)
    setTimeout(() => {
      lightningBolt = null;
    }, 400);

    // পরবর্তী lightning (১-৪ স���কেন্ড পর পর আসবে - আগে ২-৮ সেকেন্ড ছিল)
    lightningTimeout = setTimeout(createLightning, 2000 + Math.random() * 5000);
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (lightningBolt) {
      lightningBolt.draw();
    }

    requestAnimationFrame(animate);
  }

  animate();
  createLightning();

  window.toggleLightning = function() {
    if (lightningTimeout) {
      clearTimeout(lightningTimeout);
      lightningTimeout = null;
      lightningBolt = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      console.log('⚡ Lightning বন্ধ হয়েছে');
    } else {
      createLightning();
      console.log('⚡ Lightning শুরু হয়েছে');
    }
  };
}

// ── Back to Top Button ──
(function () {
  const btn = document.createElement('button');
  btn.id = 'backToTop';
  btn.innerHTML = '&#8679;'; // ⇧ arrow
  btn.title = 'Back to top';
  document.body.appendChild(btn);

  window.addEventListener('scroll', () => {
if (window.scrollY > document.body.scrollHeight / 3) {
  
  btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();


// ===== SMART RELOAD WARNING =====
let aiUsed = false;

// Track যখন ইউজার আসলেই AI কে মেসেজ পাঠায়
const originalSendMessage = sendMessage;
sendMessage = async function() {
  aiUsed = true; // AI ইউজ হইছে
  return originalSendMessage.apply(this, arguments);
}

// পেজ রিলোড/ক্লোজ করার আগে চেক করো
window.addEventListener('beforeunload', function (e) {
  // শুধু তখনই warning যখন: 
  // 1. AI ইউজ হইছে AND 
  // 2. চ্যাটে কমপক্ষে 1টা user + 1টা bot মেসেজ আছে
  if (aiUsed && chatHistory.length > 2) {
    e.preventDefault();
    const message = 'Your AI chat history will be lost if you leave this page.';
    e.returnValue = message;
    return message;
  }
});

// চ্যাট বক্স বন্ধ করলে flag রিসেট হবে না
// কারণ ইউজার আবার খুলতে পারে। রিলোড দিলেই শুধু memory যাবে


// ===== LOCALSTORAGE CONFIG =====
const CHAT_STORAGE_KEY = 'fardin_ai_chat_ui_history';
const MAX_STORED_MSG = 50;

// ===== STATS & ANIME LIST =====
function getStats() {
  const cards = document.querySelectorAll('.card-back');
  const totalAnime = cards.length;
  let totalSeasons = 0;
  let totalEpisodes = 0;

  cards.forEach((card) => {
    const seasonText = card.querySelector('.back-season')?.textContent || '';
    const episodeText = card.querySelector('.back-episodes')?.textContent || '';

    const seasonMatch = seasonText.match(/\d+/g);
    if (seasonMatch) {
      const nums = seasonMatch.map(Number);
      totalSeasons += nums.length === 1 ? nums[0] : nums[1] - nums[0] + 1;
    }

    const episodeNum = parseInt(episodeText.replace(/\D/g, ''));
    if (episodeNum) totalEpisodes += episodeNum;
  });

  return {
    animeCount: totalAnime,
    seasonCount: totalSeasons,
    episodeCount: totalEpisodes
  };
}

// ===== LEVEL 3: Ultra Compressed JSON List =====
function getAnimeListJSON() {
  const cards = document.querySelectorAll('.card-back');
  const animeObj = {};

  cards.forEach((card) => {
    const title = card.querySelector('.back-title')?.textContent?.trim();
    const episodes = card.querySelector('.back-episodes')?.textContent?.trim().replace(/\D/g, '');

    if (title && episodes) {
      animeObj[title] = parseInt(episodes) || 0;
    }
  });

  return JSON.stringify(animeObj);
}

// ===== SYSTEM PROMPT - Light Version (No List) =====
function getSystemPrompt() {
  const stats = getStats();

  return `You are Fardin's personal anime assistant on "Fardin's Anime Hub" website. You are fun, friendly and knowledgeable.

Website Stats:
- Total Anime: ${stats.animeCount}
- Total Seasons: ${stats.seasonCount}
- Total Episodes: ${stats.episodeCount}

Rules:
1. Reply in the same language the user uses. If user writes Bangla, reply in Bangla. If English, reply in English.
2. Only answer about anime Fardin has watched. Don't make up names.
3. If user asks for random/suggest/pick anime, I'll give you one from his list in [DATA] context.
4. Keep answers short, fun, and engaging.
5. Use ⚡ emoji occasionally.
6. Greet user with As-salamu alaykum and well wishes when appropriate, like first message or when user greets.
7. If user asks for details about the website owner and Fardin, say: It will be found on The side Menu Bar.Also Suggestion Box And Top 5 anime by Genre will be found there
8. Tell more good things about Fardin and his anime taste. Make it fun. Fardin loves diverse genres - action, comedy, romance, thriller. He appreciates good storytelling and character development.
9. You can use your general anime knowledge to make answers better. If I give you [DATA] context, use ONLY that for specific anime info. Don't mention you have external info.

Don't make up anime. Stick to his list only.`;
}

// ===== CHAT ELEMENTS =====
const chatBubble = document.getElementById('chatBubble');
const chatBox = document.getElementById('chatBox');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');

let chatHistory = [
  { role: "system", content: getSystemPrompt() }
];

// ===== LOCALSTORAGE FUNCTIONS =====
function saveChatToStorage() {
  const toSave = chatHistory.filter(msg => msg.role !== 'system');
  const trimmed = toSave.slice(-MAX_STORED_MSG);
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
}

function restoreChatFromStorage() {
  const saved = localStorage.getItem(CHAT_STORAGE_KEY);
  if (!saved) return;

  try {
    const savedMessages = JSON.parse(saved);
    savedMessages.forEach(msg => {
      if (msg.role === 'user') {
        addMessage(msg.content, 'user', false); 
        chatHistory.push(msg);
      } else if (msg.role === 'assistant') {
        addMessage(msg.content, 'bot', false);
        chatHistory.push(msg);
      }
    });
  } catch (e) {
    console.error('Chat restore failed:', e);
    localStorage.removeItem(CHAT_STORAGE_KEY);
  }
}

// Call restore on page load
document.addEventListener('DOMContentLoaded', () => {
  restoreChatFromStorage();
});

// ===== TOGGLE CHAT =====
function toggleChat() {
  chatBox.classList.toggle('open');
  if (chatBox.classList.contains('open')) {
    chatInput.focus();
  }
}

// ===== SEND MESSAGE =====
async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  // Add user message to UI
  addMessage(message, 'user');
  chatInput.value = '';

  // Add to history
  chatHistory.push({ role: 'user', content: message });

  // Trim history: keep system + last 8 messages for API
  if (chatHistory.length > 9) {
    chatHistory = [chatHistory[0], ...chatHistory.slice(-8)];
  }

  // Show typing indicator
  const typingDiv = addMessage('Typing...', 'bot typing');

  try {
    // Check if user wants random anime
    const needsRandom = /random|pick|suggest|recommend.*anime|কোনটা দেখব/i.test(message);

    let messagesToSend = [...chatHistory];

    // If random needed, inject the list + instruction
    if (needsRandom) {
      const animeObj = JSON.parse(getAnimeListJSON());
      const titles = Object.keys(animeObj);
      const randomTitle = titles[Math.floor(Math.random() * titles.length)];
      const epCount = animeObj[randomTitle];

      // Replace last user message with enhanced version
      messagesToSend[messagesToSend.length - 1] = {
        role: 'user',
        content: `User asked: "${message}". I randomly picked from Fardin's list: "${randomTitle}" which has ${epCount} episodes. Now reply in a fun way about this anime, mention the episode count, and ask if they want details.`
      };
    }

    // ⚡ Netlify Function এন্ডপয়েন্টে রিকোয়েস্ট পাঠানো হচ্ছে (কোনো API Key ও Proxy ছাড়াই)
    const response = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3.1-8b',
        messages: messagesToSend,
        temperature: 0.8,
        max_tokens: 200
      })
    });

    const data = await response.json();

    // Remove typing indicator
    typingDiv.remove();

    if (data.choices && data.choices[0]) {
      const botReply = data.choices[0].message.content;
      addMessage(botReply, 'bot');
      chatHistory.push({ role: 'assistant', content: botReply });
    } else {
      throw new Error('No response from API');
    }

  } catch (error) {
    typingDiv.remove();
    addMessage('Sorry, something went wrong ⚡ Try again!', 'bot');
    console.error('Cerebras Error:', error);
  }
}

// ===== ADD MESSAGE TO UI =====
function addMessage(text, type, shouldSave = true) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${type}`;
  msgDiv.textContent = text;
  msgDiv.dataset.role = type === 'user' ? 'user' : 'assistant';
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Save to localStorage after adding
  if (shouldSave && (type === 'user' || type === 'bot')) {
    saveChatToStorage();
  }

  return msgDiv;
}

// ===== CLEAR CHAT HISTORY =====
function clearChatHistory() {
  localStorage.removeItem(CHAT_STORAGE_KEY);
  chatMessages.innerHTML = '';
  chatHistory = [
    { role: "system", content: getSystemPrompt() }
  ];
}

// ===== CLEAR CHAT HISTORY - NEW =====
function clearChatHistory() {
  localStorage.removeItem(CHAT_STORAGE_KEY);
  chatMessages.innerHTML = '';
  chatHistory = [
    { role: "system", content: getSystemPrompt() }
  ];
}
