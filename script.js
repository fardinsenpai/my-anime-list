window.onload = () => {
  const duration = 4500; // 7 seconds until everything ends
  const boxes = document.querySelectorAll(".counter-box");

  // Fade + Slide animation trigger
  boxes.forEach((box, index) => {
    setTimeout(() => {
      box.classList.add("show");
    }, index * 200); // staggered entry (optional)
  });

  // Counter start
const stats = getStats();
counterUp("animeCount", stats.animeCount, duration);  
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

// === 1. Data & Order (kept as before) ===
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

// === 🏆 CRUNCHYROLL ANIME OF THE YEAR WINNERS ===
const AWARD_WINNERS = {
  "2026": { id: 1,   title: "My Hero Academia FINAL SEASON" },
  "2025": { id: 10,  title: "Solo Leveling" },
  "2024 & 2021": { id: 11,  title: "Jujutsu Kaisen Season 2" },
  "2023": { id: 75,  title: "Cyberpunk: Edgerunners" },
  "2022": { id: 29,  title: "Attack on Titan Final Season" },
  "2020": { id: 24,  title: "Demon Slayer" },
  "2019": { id: 248, title: "Devilman Crybaby" },
  "2018": { id: 249, title: "Made in Abyss" },
  "2017": { id: 235, title: "Yuri!!! on Ice" }
};

const waifus = [
{ name:"Zero Two", anime:"Darling in the FranXX", first:"Episode 1", img:"https://wallpapers.com/images/high/zero-two-in-a-bikini-f4klpy8d6ubud62l.webp" },
{ name:"Makima", anime:"Chainsaw Man", first:"Episode 1", img:"https://wallpapers.com/images/high/makima-chainsaw-man-djt1vr1n5a7ldotw.webp" },
{ name:"Power", anime:"Chainsaw Man", first:"Episode 2", img:"https://images6.alphacoders.com/125/thumb-1920-1258914.png" },
{ name:"Marin Kitagawa", anime:"My Dress-Up Darling", first:"Episode 1", img:"https://wallpapers.com/images/high/marin-kitagawa-clothing-store-1fltzf29e9nebb4x.webp" },
{ name:"Emilia", anime:"Re:Zero", first:"Episode 1", img:"https://preview.redd.it/emilia-blushing-by-media-v0-49uj0rtc80de1.jpeg?auto=webp&s=3c9e84ac735d0e90e746638767cf14e1fa2de77f" },
{ name:"Rem", anime:"Re:Zero", first:"Episode 11", img:"https://wallpapers.com/images/high/maid-rem-closed-up-oiad9wh7vembj93n.webp" },
{ name:"Ram", anime:"Re:Zero", first:"Episode 11", img:"https://wallpapers.com/images/high/re-zero-ram-1920-x-1080-wallpaper-61f4p7ddgtnasc3b.webp" },
{ name:"Yor Forger", anime:"Spy x Family", first:"Episode 2", img:"https://wallpapers.com/images/high/yor-forger-aesthetic-anime-girl-iphone-nppozimww9ovmmku.webp" },
{ name:"Asuna Yuuki", anime:"Sword Art Online", first:"Episode 2", img:"https://static0.cbrimages.com/wordpress/wp-content/uploads/2020/10/Asuna-Smiling-Sword-Art-Online.jpeg?w=1200&h=675&fit=crop" },
{ name:"Sinon", anime:"Sword Art Online II", first:"Episode 1", img:"https://wallpapers.com/images/high/sinon-si4zxdtwzvp3soag.webp" },
{ name:"Mikasa Ackerman", anime:"Attack on Titan", first:"Episode 1", img:"https://wallpapers.com/images/high/mikasa-ackerman-short-haired-m5cgaysqztmwgsq6.webp" },
{ name:"Annie Leonhart", anime:"Attack on Titan", first:"Episode 5", img:"https://wallpapers.com/images/high/annie-leonhart-900-x-900-wallpaper-apk6p35i879euh05.webp" },
{ name:"Nobara Kugisaki", anime:"Jujutsu Kaisen", first:"Episode 3", img:"https://wallpapers.com/images/high/nobara-kugisaki-1081-x-1080-wallpaper-dqbwend3id075ym0.webp" },
{ name:"Maki Zenin", anime:"Jujutsu Kaisen", first:"Episode 5", img:"https://wallpapers.com/images/high/maki-zenin-smiling-anime-character-dhlu6imhh7uhvie4.webp" },
{ name:"Chizuru Mizuhara", anime:"Rent A Girlfriend", first:"Episode 1", img:"https://img.anmosugoi.com/file/media-sugoi/2025/02/Kanojo-Okarishimasu-Chizuru-Mizuhara-min-1.webp" },
{ name:"Alya", anime:"Alya Sometimes Hides Her Feelings in Russian", first:"Episode 1", img:"https://cdn.polyspeak.ai/speakmaster/b1b542877ee7e46dab98b61052c74639.webp" },
{ name:"Raphtalia", anime:"Shield Hero", first:"Episode 2", img:"https://wallpapers.com/images/hd/raphtalia-rising-of-the-shield-hero-hjyqjb1uc7ch9qgm.webp" },
{ name:"Nezuko Kamado", anime:"Demon Slayer", first:"Episode 1", img:"https://wallpapers.com/images/high/nezuko-pictures-gm59bgxoepcb949y.webp" },
{ name:"Shinobu Kochou", anime:"Demon Slayer", first:"Episode 15", img:"https://images.alphacoders.com/124/thumb-1920-1248332.jpg" },
{ name:"Mitsuri Kanroji", anime:"Demon Slayer", first:"Episode 21", img:"https://wallpapers.com/images/high/mitsuri-kanroji-sunglasses-je6rn6rjp4rj5gwv.webp" },
{ name:"Hinata Hyuga", anime:"Naruto", first:"Episode 1", img:"https://wallpapers.com/images/high/hinata-hyuga-pink-flowers-e6tv5nuej4max8l9.webp" },
{ name:"Tsunade", anime:"Naruto", first:"Episode 83", img:"https://wallpapers.com/images/high/tsunade-iphone-ovmbonragdaqzuri.webp" },
{ name:"Erza Scarlet", anime:"Fairy Tail", first:"Episode 4", img:"https://wallpapers.com/images/high/erza-scarlet-1080-x-1920-wallpaper-u8imd2ydifw92nup.webp" },
{ name:"Lucy Heartfilia", anime:"Fairy Tail", first:"Episode 1", img:"https://wallpapers.com/images/high/lucy-heartfilia-1075-x-1511-wallpaper-b28qfqkf6pxcb3w1.webp" },
{ name:"Juvia Lockser", anime:"Fairy Tail", first:"Episode 21", img:"https://wallpapers.com/images/high/juvia-lockser-1600-x-1103-wallpaper-gklq2nqmfpwqq60n.webp" },
{ name:"Kaguya Shinomiya", anime:"Kaguya-sama", first:"Episode 1", img:"https://wallpapers.com/images/high/kaguya-sama-love-is-war-zv3ms1t9labfsk1p.webp" },
{ name:"Chika Fujiwara", anime:"Kaguya-sama", first:"Episode 1", img:"https://4kwallpapers.com/images/walls/thumbs_3t/16162.jpg" },
{ name:"Frieren", anime:"Frieren Beyond Journey's End", first:"Episode 1", img:"https://wallpapers.com/images/high/elven-mage-frieren-contemplative-journey-26rwlnum3uzoexzy.webp" },
{ name:"Fern", anime:"Frieren Beyond Journey's End", first:"Episode 2", img:"https://i.pinimg.com/736x/01/f8/fd/01f8fd15a396b327d11cafb1335a202a.jpg" },
{ name:"Maomao", anime:"The Apothecary Diaries", first:"Episode 1", img:"https://i.pinimg.com/736x/53/98/b3/5398b32834a98ed3a5fcc3f37f7193e5.jpg" },
{ name:"Akari Watanabe", anime:"More Than a Married Couple", first:"Episode 1", img:"https://images8.alphacoders.com/129/thumb-1920-1293517.png" },
{ name:"Tomo Aizawa", anime:"Tomo-chan Is a Girl!", first:"Episode 1", img:"https://scontent.fdac24-5.fna.fbcdn.net/v/t39.30808-6/600310017_838018285806964_3833664299587309993_n.jpg?stp=dst-jpg_s640x640_tt6&_nc_cat=105&ccb=1-7&_nc_sid=833d8c&_nc_eui2=AeF1uH6cy2OKgVkz2wlm3qePDL-9nvuEy3kMv72e-4TLeSHhZEVNP_R7wxkw_N8rXxyEVVFa_QHiuqN7omBYjLiO&_nc_ohc=dRLRMi5pRmcQ7kNvwGrDngq&_nc_oc=AdoL9VVXmIDecWSIBjjOGnxsSZ9ZiGCSAaneht0Qv7TQscVDAhVOJZ5sNakcCfdydRM&_nc_zt=23&_nc_ht=scontent.fdac24-5.fna&_nc_gid=2RpY0AgptGeq0tNvISBndQ&_nc_ss=7b2a8&oh=00_Af49mH7r4x0sPjbYGWcYxjPnqaDca6j0QwPvauXP2iEIng&oe=6A1E303A" },
{ name:"Hori Kyouko", anime:"Horimiya", first:"Episode 1", img:"https://wallpapers.com/images/high/kyouko-hori-portrait-hori-san-to-miyamura-kun-anime-character-a57podftpoh68m4s.webp" },
{ name:"Akane Kinoshita", anime:"My Love Story with Yamada-kun at Lv999", first:"Episode 1", img:"https://scontent.fdac198-2.fna.fbcdn.net/v/t39.30808-6/496426989_1092601966243760_1410953789171529867_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeERGPl7UogDMwfFG-ebKvFTKWJOVqndQIgpYk5Wqd1AiL3CFMiAvSzWJ1gdH7MRfPnC2zIEHzaoiMms-nWtFURb&_nc_ohc=ubgV4EI8rAsQ7kNvwFcZkCt&_nc_oc=Adpurod_48S4bhnyLhWrR3zrO6Sj25bTX8syiUXN7Zlt0eNLxLqdCxhUdA6JoU9y_wk&_nc_zt=23&_nc_ht=scontent.fdac198-2.fna&_nc_gid=1eAJoSDIUm-TQDcdCyLAbQ&_nc_ss=7b2a8&oh=00_Af5-oX8EjG8b24u9it4T3-9sleVVCkzvjnU5HLzqsVdVAQ&oe=6A1E3C27" },
];

function openWaifus(){
  if (typeof closeMenu === 'function') closeMenu();

  const overlay = document.getElementById("waifuOverlay");
  const grid = document.getElementById("waifuGrid");

  if (overlay.style.display === "block") return;

  grid.innerHTML = "";

  waifus.forEach((w, index) => {

    grid.innerHTML += `

      <div class="waifu-card">

        <div class="waifu-inner">

          <div class="waifu-front">

            <img src="${w.img}" alt="${w.name}">

            <div class="waifu-badge">
              #${index + 1}
            </div>

            <div class="waifu-info">
              <h3>${w.name}</h3>
            </div>

          </div>

          <div class="waifu-back">

            <h3>${w.anime}</h3>

            <p>${w.first}</p>

          </div>

        </div>

      </div>

    `;

  });

  overlay.style.display = "block";

  requestAnimationFrame(() => {

    document.querySelectorAll(".waifu-card").forEach(card => {

      card.addEventListener("click", () => {
        card.classList.toggle("flip");
      });

    });

  });

}

function closeWaifus(){
  document.getElementById("waifuOverlay").style.display = "none";
}

function showToast(title, msg, type) {
  const existing = document.querySelector('.award-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'award-toast';
  toast.innerHTML = `<strong>${title}</strong><br>${msg}`;
  Object.assign(toast.style, {
    position:'fixed', bottom:'30px', right:'30px', zIndex:'9999',
    padding:'16px 24px', borderRadius:'12px', color:'#fff',
    fontFamily:'Rajdhani, sans-serif', fontSize:'1.1rem',
    boxShadow:'0 8px 32px rgba(0,0,0,0.4)', opacity:'0',
    transform:'translateY(20px)', transition:'all 0.4s ease',
    background: type === 'warning' ? 'linear-gradient(135deg,#ff416c,#ff4b2b)' : '#333'
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function showAllAwardWinners() {
  removeWaifuGrid();
  const grid = document.getElementById('grid');
  const cards = Array.from(document.querySelectorAll('.card'));
  const mainTitle = document.querySelector('.header h1');
  const counterSection = document.querySelector('.counter-container');
  const searchSection = document.querySelector('.search-wrap');
  const genreSection = document.querySelector('.filter-section');

  cards.forEach(card => {
    card.classList.add('hidden');
    card.style.display = "none";
  });

  if (mainTitle) {
    const newText = 'Crunchyroll Anime of the Year Winners';
    mainTitle.textContent = newText;
    mainTitle.setAttribute('data-text', newText);
    mainTitle.style.fontSize = "clamp(1.2rem, 3.5vw, 2rem)";
  }
  if (counterSection) counterSection.style.display = 'none';
  if (searchSection) searchSection.style.display = 'none';
  if (genreSection) genreSection.style.display = 'none';

  const years = Object.keys(AWARD_WINNERS).sort((a, b) => b - a);
  let foundCount = 0;

  years.forEach(year => {
    const winner = AWARD_WINNERS[year];
    if (winner.id === null) return;

    const matchingCard = cards.find(card => {
      const numEl = card.querySelector('.number');
      return numEl && parseInt(numEl.textContent.replace(/\D/g, '')) === winner.id;
    });

    if (matchingCard) {
      matchingCard.classList.remove('hidden');
      matchingCard.style.display = "block";
      const badge = matchingCard.querySelector('.badge');
      if (badge) badge.textContent = `👑 ${year} WINNER`;
      grid.appendChild(matchingCard);
      foundCount++;
    }
  });

  if (typeof closeMenu === 'function') closeMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showWaifus() {
  const grid = document.getElementById('grid');
  const existingCards = Array.from(document.querySelectorAll('.card'));
  const mainTitle = document.querySelector('.header h1');
  const counterSection = document.querySelector('.counter-container');
  const searchSection = document.querySelector('.search-wrap');
  const genreSection = document.querySelector('.filter-section');

  existingCards.forEach(c => { c.classList.add('hidden'); c.style.display = "none"; });

  if (mainTitle) {
    const txt = '👑 Waifu Collection';
    mainTitle.textContent = txt;
    mainTitle.setAttribute('data-text', txt);
    mainTitle.style.fontSize = "clamp(1.2rem, 3.5vw, 2rem)";
  }
  if (counterSection) counterSection.style.display = 'none';
  if (searchSection) searchSection.style.display = 'none';
  if (genreSection) genreSection.style.display = 'none';

  const waifuGrid = document.getElementById('waifu-grid') || (() => {
    const wg = document.createElement('div');
    wg.id = 'waifu-grid';
    wg.className = 'grid waifu-grid';
    grid.parentNode.insertBefore(wg, grid.nextSibling);
    return wg;
  })();

  waifuGrid.innerHTML = '';
  waifuGrid.style.display = 'grid';

  WAIFUS.forEach((w, i) => {
    const card = document.createElement('div');
    card.className = 'card waifu-card';
    const srcCard = document.querySelectorAll('.card')[w.card - 1];
    const imgSrc = w.img || (function(){ if(!srcCard) return ''; var pi=srcCard.querySelector('.poster-wrap img'); return pi?pi.getAttribute('src'):'' })();
    const animeTitle = (function(){ if(!srcCard) return 'Unknown'; var t=srcCard.querySelector('.title'); return t?t.textContent:'Unknown' })();
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front waifu-front">
          <div class="poster-wrap waifu-poster">
            <img src="${imgSrc}" alt="${w.name}" loading="lazy" class="waifu-img"/>
            <span class="badge waifu-badge">#${i+1}</span>
          </div>
          <div class="info waifu-info">
            <div class="title waifu-name">${w.name}</div>
          </div>
        </div>
        <div class="card-back waifu-back">
          <div class="back-content">
            <div class="back-title">${w.name}</div>
            <div class="back-season">${w.note}</div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:13px;color:#b8b8ff;letter-spacing:1px;padding:4px 12px;border:1px solid rgba(184,184,255,0.3);border-radius:20px;background:rgba(184,184,255,0.08);">${animeTitle}</div>
          </div>
        </div>
      </div>`;
    card.addEventListener('click', function() {
      document.querySelectorAll('.waifu-card.flipped').forEach(fc => { if (fc !== this) fc.classList.remove('flipped'); });
      this.classList.toggle('flipped');
    });
    waifuGrid.appendChild(card);
  });

  if (typeof closeMenu === 'function') closeMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeWaifuGrid() {
  const wg = document.getElementById('waifu-grid');
  if (wg) { wg.style.display = 'none'; wg.innerHTML = ''; }
  const ov = document.getElementById('waifuOverlay');
  if (ov) ov.style.display = 'none';
}

// === 5. Waifu Collection Section ===
function filterTopFive(genre) {
  removeWaifuGrid();
  const targetIds = TOP_5_DATA[genre]; 
  const grid = document.getElementById('grid');
  const cards = Array.from(document.querySelectorAll('.card'));
  
  const mainTitle = document.querySelector('.header h1');
  const counterSection = document.querySelector('.counter-container');
  const searchSection = document.querySelector('.search-wrap');
  const genreSection = document.querySelector('.filter-section');

  // Build waifu card HTML element
  if (mainTitle) {
    const newText = `Top 5 Picks From ${genre}`;
    mainTitle.textContent = newText;
    mainTitle.setAttribute('data-text', newText);
    mainTitle.style.fontSize = "clamp(1.4rem, 4vw, 2.2rem)"; 
  }

  // Find corresponding anime card
  if (counterSection) counterSection.style.display = 'none';
  if (searchSection) searchSection.style.display = 'none';
  if (genreSection) genreSection.style.display = 'none';

  cards.forEach(card => {
    card.classList.add('hidden');
    card.style.display = "none";
  });

  // Data attribute mapping for waifus
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

// === 4. Sakura Chat Box & Falling Petals ===
document.addEventListener('DOMContentLoaded', () => {
  const dropBtn = document.getElementById('dropBtn');
  const sideDropdown = document.getElementById('topFiveDropdown');
  
  if (dropBtn && sideDropdown) {
    dropBtn.onclick = function(e) {
      e.preventDefault();
      sideDropdown.classList.toggle('active');
    };
  }

  // Home shows petals normally
  const homeBtn = document.getElementById('homeLink');
  if(homeBtn) {
    homeBtn.onclick = (e) => {
      e.preventDefault();
      
      const mainTitle = document.querySelector('.header h1');
      if (mainTitle) {
        const originalText = "Let's See What Anime I Have Watched:-";
        mainTitle.textContent = originalText;
        mainTitle.setAttribute('data-text', originalText);
        mainTitle.style.fontSize = ""; 
      }

      const counterSection = document.querySelector('.counter-container');
      const searchSection = document.querySelector('.search-wrap');
      const genreSection = document.querySelector('.filter-section');
      
      if(counterSection) counterSection.style.display = 'flex';
      if(searchSection) searchSection.style.display = 'flex';
      if(genreSection) genreSection.style.display = 'block';

      removeWaifuGrid();

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
    "All":        { icon: "✦", nums: null },
    "Action":        { icon: "⚔", nums: new Set([1,2,3,4,5,6,7,8,10,11,13,14,15,16,17,19,22,23,24,26,27,28,29,30,32,34,36,37,40,42,43,46,48,49,50,52,55,61,62,63,64,65,66,67,68,69,70,73,74,75,76,78,80,81,85,86,89,90,92,93,94,97,98,99,100,102,104,105,106,107,114,115,116,118,125,126,127,129,130,135,136,137,139,140,141,146,149,152,158,162,165,169,170,173,174,175,179,180,181,184,187,188,190,194,195,198,199,201,202,203,205,212,214,218,220,221,225,226,227,228,231,232,234,237,240,242,243,246,247,248]) },
    "Adventure":        { icon: "🗺", nums: new Set([1,2,3,4,5,6,7,10,13,17,18,25,29,36,37,39,46,62,64,66,76,79,81,93,100,104,105,118,120,126,128,134,135,136,137,143,149,154,155,156,160,161,163,165,167,171,179,181,182,183,188,189,191,206,207,208,209,214,216,224,231,233,237,239,240,249]) },
    "Comedy":        { icon: "😂", nums: new Set([4,5,7,14,15,19,23,32,33,40,43,56,62,63,65,67,69,70,74,84,85,90,101,105,108,115,117,123,131,133,134,138,139,140,144,148,150,151,154,155,157,162,169,171,175,176,185,186,195,196,197,198,199,201,213,215,219,220,221,222,229,238,241,243,245]) },
    "Sports":        { icon: "🏆", nums: new Set([8,9,16,21,30,44,94,96,98,110,125,129,132,200,202,235,246]) },
    "Isekai":        { icon: "🌌", nums: new Set([18,34,52,63,68,69,82,89,90,93,99,102,105,114,115,117,120,127,128,131,133,134,135,137,139,142,143,149,154,155,160,161,163,165,167,169,170,171,173,174,175,181,184,185,187,189,194,198,199,201,207,208,209,212,214,216,218,222,226,228,232,233,236,238]) },
    "Dark / Horror":        { icon: "💀", nums: new Set([10,11,12,22,24,27,28,29,40,42,47,48,49,50,52,53,65,66,67,68,73,75,76,95,99,100,114,116,130,141,152,158,159,170,172,180,182,184,190,203,205,214,217,225,228,231,242,247,248,249]) },
    "Romcom":        { icon: "💕", nums: new Set([20,35,38,41,45,51,57,58,59,60,71,72,77,80,82,83,84,85,87,91,103,106,108,109,112,113,122,132,138,142,153,159,162,166,168,177,185,193,197,207,210,211,219,223,238,240,241,243,245]) },
    "Slice of Life":        { icon: "🌸", nums: new Set([12,19,20,27,31,35,38,39,43,47,51,54,57,58,59,72,77,79,83,88,95,103,109,111,112,113,119,121,122,123,124,133,138,144,145,147,148,150,151,153,156,157,160,161,164,166,168,172,176,177,178,186,189,191,192,193,196,204,206,208,210,213,215,219,222,223,224,230,235,241,245]) },
    "Sci-Fi":        { icon: "🚀", nums: new Set([25,26,61,65,71,73,75,78,106,135,141,164,183,213,217,234,242,247]) },
    "Historical":        { icon: "📜", nums: new Set([13,24,42,49,77,86,88,92,146,158,168,227]) },
    "Psychological":        { icon: "🧠", nums: new Set([12, 29, 31, 47, 53, 68, 73, 95, 152, 205, 244]) },

  };
// Just 1 line add for global expose
  window.ANIME_GENRES = GENRES;
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
    var mainSearch = document.getElementById("searchBox"); // Main search bar reference
    var stickySearch = document.getElementById('stickySearch');
    
    // Search bar: filter cards as user types
    if (window.pageYOffset > mainSearch.offsetTop + mainSearch.offsetHeight) {
        stickySearch.style.display = "block";
    } else {
        stickySearch.style.display = "none";
    }
};

// Search bar interaction logic
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
        // Extract and display anime info from card data
        const statusText = card.querySelector('.season').innerText;

        if (category === 'all') {
            card.style.display = "block";
        } 
        else if (category === 'Series') {
            // Replace "Season" with "Episodes" fallback for OVA/Series
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
    
    // --- Sakura Petal Animation Engine ---

    // 1. Randomize start position
    sakura.style.left = Math.random() * 100 + "vw";
    
    // 2. Vary falling speed (0.8x-1.2x of base)
    const size = Math.random() * 10 + 5 + "px";
    sakura.style.width = size;
    sakura.style.height = size;
    
    // 3. Vary petal size (0.6x-1.4x of base)
    const fallDuration = Math.random() * 10 + 5;
    sakura.style.animationDuration = fallDuration + "s, 4s"; // fall + sway timings
    
    // 4. Fade out at bottom (opacity 0.3-1.0)
    sakura.style.opacity = Math.random() * 0.5 + 0.5;

    // 5. Rotation and horizontal drift variation
    sakura.style.animationDelay = Math.random() * 5 + "s";

    document.body.appendChild(sakura);

    // Assign computed random values to CSS custom properties
    setTimeout(() => {
        sakura.remove();
    }, fallDuration * 1000);
}

// Periodic petal regeneration for continuous effect
setInterval(createSakura, 550);

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
            card.style.display = "block"; // Show matched card
            visibleCount++;
        } else {
            card.style.display = "none";  // Hide unmatched card
        }
    });

    // Track visible count for no-results message
    if (visibleCount === 0) {
        noResults.style.display = "block"; // Show no results message
    } else {
        noResults.style.display = "none";  // Hide no results message
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
    // Draw Lightning bolt effect
    this.ctx.strokeStyle = `rgba(100, 150, 255, 0.95)`; // Lightning blue
    this.ctx.lineWidth = 4 + Math.random() * 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(this.x, this.y);

    for (let segment of this.segments) {
      this.ctx.lineTo(segment.x, segment.y);
    }

    this.ctx.stroke();

    // Draw branching sub-bolts
    for (let segment of this.segments) {
      if (Math.random() > 0.7) {
        this.drawBranch(segment.x, segment.y);
      }
    }
  }

  drawBranch(startX, startY) {
    this.ctx.strokeStyle = `rgba(100, 150, 255, 0.7)`; // Lightning sub-color
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

// Canvas resize handler
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
    
    // Check if enough time has passed for next lightning (min 3000ms)
    setTimeout(() => {
      lightningBolt = null;
    }, 400);

    // Generate random lightning (1-3 bolts with varying intensity)
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
      console.log('New Lightning bolt generated');
    } else {
      createLightning();
      console.log('Lightning bolt faded out');
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




// Chat memory cleanup flag to prevent memory leaks
// Clear old messages from DOM when threshold exceeded

const apiUrl = 'https://anime-api-brown-phi.vercel.app/api/chat';

// ===== LOCALSTORAGE CONFIG - NEW =====
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
      totalSeasons += nums.length === 1? nums[0] : nums[1] - nums[0] + 1;
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
8. If user want Tell more good things about Fardin and his anime taste. Make it fun. Fardin loves diverse genres - action, comedy, romance, thriller. He appreciates good storytelling and character development.
9. You can use your general anime knowledge to make answers better. If I give you [DATA] context, use ONLY that for specific anime info. Don't mention you have external info.
10. Mostly tell user about the website anime duel system, and they can find it in the side menu. Tell them to try it out and have fun dueling anime ratings based on Fardin's list.
11.Do not tell user about Fardin total anime and Episode count. Only tell them if they ask for it. If they ask, give them the stats in a fun way and then say "Explore the list and find your next watch!".
12. If user asks for how to give feedback or suggest anime, tell them to use the suggestion box in the side menu. Say "Your suggestions help Fardin discover new gems and make the website even better!".
13.Always try to answer in few sentences talk more if user asks for more details. 
14. Anime Of the year details are given in the code I can say it if user asks for it. 
15. You will not use this 🙏 emoji to talk.Use this ✨ emoji.

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

// ===== LOCALSTORAGE FUNCTIONS - NEW =====
function saveChatToStorage() {
const toSave = chatHistory.filter(msg =>
  msg.role === 'user' || msg.role === 'assistant'
);  const trimmed = toSave.slice(-MAX_STORED_MSG);
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
}

function restoreChatFromStorage() {
  const saved = localStorage.getItem(CHAT_STORAGE_KEY);
  if (!saved) return;

  try {
    const savedMessages = JSON.parse(saved);
    savedMessages.forEach(msg => {
      if (msg.role === 'user') {
        addMessage(msg.content, 'user', false); // false = don't save again
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
    chatHistory = [chatHistory[0],...chatHistory.slice(-8)];
  }

  // Show typing indicator
  const typingDiv = addMessage('Typing...', 'bot typing');

  try {
    // Check if user wants random anime
    const needsRandom = /random|pick|suggest|recommend.*anime|random/i.test(message);

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

   const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
      body: JSON.stringify({
        model: 'gpt-oss-120b',
        messages: messagesToSend,
        temperature: 0.8,
        max_tokens: 200,
        stream: false
      })
    });

    const data = await response.json();

    // Remove typing indicator
    if (data.choices && data.choices[0]) {

  // Remove typing bubble here
  typingDiv.remove();

  const botReply = data.choices[0].message.content;

  chatHistory.push({
    role: 'assistant',
    content: botReply
  });

  addMessage(botReply, 'bot');

  saveChatToStorage();

} else {
  throw new Error('No response from API');
}

} catch (error) {

  // Keep this
  typingDiv.remove();

  addMessage('Sorry, something went wrong ⚡ Try again!', 'bot');

  console.error('Cerebras Error:', error);
}
}

// ===== ADD MESSAGE TO UI - PREMIUM ANIMATION VERSION =====
function addMessage(text, type, shouldSave = true) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${type}`;

  // USER MESSAGE → instant
  if (type === 'user') {
    msgDiv.textContent = text;
  }

  // BOT MESSAGE → animated typing effect
  else if (type === 'bot') {

    // Create span for animated text
    const textSpan = document.createElement('span');
    msgDiv.appendChild(textSpan);

    let index = 0;

    // Typewriter effect
    function typeWriter() {
      if (index < text.length) {
        textSpan.textContent += text.charAt(index);
        index++;

        // Auto scroll while typing
        chatMessages.scrollTop = chatMessages.scrollHeight;

        setTimeout(typeWriter, 5); // typing speed
      }
    }

    // Small delay before bot starts typing
    setTimeout(() => {
      typeWriter();
    }, 250);
  }

  // TYPING INDICATOR
  else if (type.includes('typing')) {
    msgDiv.innerHTML = `
      <div class="typing-animation">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
  }

  msgDiv.dataset.role = type === 'user' ? 'user' : 'assistant';

  // Smooth appearance
  msgDiv.style.opacity = '0';
  msgDiv.style.transform = 'translateY(10px)';

  chatMessages.appendChild(msgDiv);

  setTimeout(() => {
    msgDiv.style.transition = 'all 0.3s ease';
    msgDiv.style.opacity = '1';
    msgDiv.style.transform = 'translateY(0)';
  }, 10);

  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Save
  if (shouldSave && (type === 'user' || type === 'bot')) {
    saveChatToStorage();
  }

  return msgDiv;
}


// ===== ENTER KEY SUPPORT =====
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

// ===== CLOSE CHAT ON OUTSIDE CLICK =====
document.addEventListener('click', (e) => {
  if (!chatBox.contains(e.target) &&!chatBubble.contains(e.target)) {
    chatBox.classList.remove('open');
  }
});

// ===== AI CONTEXT HELPER - Enhanced context building =====
const originalFetch = window.fetch;

window.fetch = function(...args) {
  const [url, options] = args;

  // Intercept Cerebras API call
  if (url.includes('cerebras.ai') && options?.body) {
    try {
      const body = JSON.parse(options.body);
      const userMsg = body.messages[body.messages.length - 1]?.content || '';

      let extraInfo = '';

    // 1. Support "number" queries: "78 number anime"
      const numMatch = userMsg.match(/#?(\d+)\s*(number|no\.?|th|st|nd|rd)?/i);
      if (numMatch) {
        const num = parseInt(numMatch[1]);
        const cards = document.querySelectorAll('.anime-card,.card');

        for (let card of cards) {
          const numEl = card.querySelector('[class*="number"], [class*="no"]');
          const titleEl = card.querySelector('h3, [class*="title"]');

          if (numEl && titleEl) {
            const cardNum = parseInt(numEl.textContent.replace(/\D/g, ''));
            if (cardNum === num) {
              extraInfo = `\n[DATA]: Anime #${num} is "${titleEl.textContent.trim()}". Use this exact info.`;
              break;
            }
          }
        }

        if (!extraInfo) {
          extraInfo = `\n[DATA]: Fardin hasn't watched anime #${num} yet.`;
        }
      }

    // 2. Support random/suggest queries
      if (/random|suggest|pick|recommend/i.test(userMsg)) {
        const cards = document.querySelectorAll('.anime-card,.card');
        const randomCard = cards[Math.floor(Math.random() * cards.length)];

        const numEl = randomCard.querySelector('[class*="number"], [class*="no"]');
        const titleEl = randomCard.querySelector('h3, [class*="title"]');

        if (numEl && titleEl) {
          const num = numEl.textContent.replace(/\D/g, '');
          const title = titleEl.textContent.trim();
          extraInfo = `\n[DATA]: Suggest this anime: #${num} "${title}". Talk about it.`;
        }
      }

    // Append extra info to system prompt
      if (extraInfo && body.messages[0]?.role === 'system') {
        body.messages[0].content += extraInfo;
        options.body = JSON.stringify(body);
      }

    } catch (e) {
      console.log('AI context error:', e);
    }
  }

  return originalFetch.apply(this, args);
};

// ===== CLEAR CHAT HISTORY - UPDATED =====
function clearChatHistory() {
  if (confirm('Clear chat history? This cannot be undone.')) {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    chatMessages.innerHTML = '';
    chatHistory = [
      { role: "system", content: getSystemPrompt() }
    ];
    addMessage('Chat history has been cleared successfully!', 'bot');
  }
}



/* ══════════════════════════════════════
   🤖 SIDEBAR AI CHAT - SIMPLE & WORKING
══════════════════════════════════════ */

// Sidebar button click
document.addEventListener('click', function(e) {
  // AI Chat menu button
  if (e.target.closest('#aiChatMenuBtn')) {
    e.preventDefault();
    
    // Toggle sidebar visibility
    document.getElementById('sideBar')?.classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('active');
    
    // Chat bubble click handler
    document.querySelector('.chat-bubble')?.click();
  }
  
  // Close button click - manual close
  if (e.target.closest('.chat-box .chat-close, .chat-box #chatCloseBtn')) {
    const chatBox = document.querySelector('.chat-box');
    chatBox?.classList.remove('open');
    chatBox.style.display = 'none'; // Force hide
  }
});

function toggleChat() {
  // Chat history CSS styles
  const chatBox = document.querySelector('.chat-box');
  chatBox?.classList.toggle('open');
  
  // Sidebar toggle styles
  if (typeof closeMenu === 'function') closeMenu();
}

// AI Chat button click handler
document.getElementById('aiChatMenuBtn')?.addEventListener('click', toggleChat);



