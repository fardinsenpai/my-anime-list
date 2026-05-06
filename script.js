// ── Flip Card Toggle ──


(function () {
  const GENRES = {
    "All":           { icon: "✦", nums: null },
    "Action":        { icon: "⚔", nums: new Set([1,2,3,4,5,6,7,8,10,11,13,14,15,16,17,19,22,23,24,26,27,28,29,30,32,34,36,37,40,42,43,46,48,49,50,52,55,61,62,63,64,65,66,67,68,69,70,73,74,75,76,78,80,81,85,86,89,90,92,93,94,97,98,99,100,102,104,105,106,107,114,115,116,118,125,126,127,129,130,135,136,137,139,140,141,146,149,152,158,162,165,169,170,173,174,175,179,180,181,184,187,188,190,194,195,198,199,201,202,203,205,212,214,218,220,221,225,226,227,228,231,232,234]) },
    "Adventure":     { icon: "🗺", nums: new Set([1,2,3,4,5,6,7,10,13,17,18,25,29,36,37,39,46,62,64,66,76,79,81,93,100,104,105,118,120,126,128,134,135,136,137,143,149,154,155,156,160,161,163,165,167,171,179,181,182,183,188,189,191,206,207,208,209,214,216,224,231,233]) },
    "Comedy":        { icon: "😂", nums: new Set([4,5,7,14,15,19,23,32,33,40,43,56,62,63,65,67,69,70,74,84,85,90,101,105,108,115,117,123,131,133,134,138,139,140,144,148,150,151,154,155,157,162,169,171,175,176,185,186,195,196,197,198,199,201,213,215,219,220,221,222,229]) },
    "Sports":        { icon: "🏆", nums: new Set([8,9,16,21,30,44,94,96,98,110,125,129,132,200,202,235]) },
    "Isekai":        { icon: "🌀", nums: new Set([18,34,52,63,68,69,82,89,90,93,99,102,105,114,115,117,120,127,128,131,133,134,135,137,139,142,143,149,154,155,160,161,163,165,167,169,170,171,173,174,175,181,184,185,187,189,194,198,199,201,207,208,209,212,214,216,218,222,226,228,232,233]) },
    "Dark / Horror": { icon: "💀", nums: new Set([10,11,12,22,24,27,28,29,40,42,47,48,49,50,52,53,65,66,67,68,73,75,76,95,99,100,114,116,130,141,152,158,159,170,172,180,182,184,190,203,205,214,217,225,228,231]) },
    "Romcom":        { icon: "💕", nums: new Set([20,35,38,41,45,51,57,58,59,60,71,72,77,80,82,83,84,85,87,91,103,106,108,109,112,113,122,132,138,142,153,159,162,166,168,177,185,193,197,207,210,211,219,223]) },
    "Slice of Life": { icon: "🌸", nums: new Set([12,19,20,27,31,35,38,39,43,47,51,54,57,58,59,72,77,79,83,88,95,103,109,111,112,113,119,121,122,123,124,133,138,144,145,147,148,150,151,153,156,157,160,161,164,166,168,172,176,177,178,186,189,191,192,193,196,204,206,208,210,213,215,219,222,223,224,230,235]) },
    "Sci-Fi":        { icon: "🚀", nums: new Set([25,26,61,65,71,73,75,78,106,135,141,164,183,213,217,234]) },
    "Historical":    { icon: "📜", nums: new Set([13,24,42,49,77,86,88,92,146,158,168,227]) },
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
  counterUp("animeCount", 235, duration);
  counterUp("seasonCount", 346, duration);
  counterUp("episodeCount", 6142, duration);
};


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
