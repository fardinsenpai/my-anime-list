
function createPetal() {
  const petal = document.createElement("div");
  petal.classList.add("petal");

  // random horizontal start position
  petal.style.left = Math.random() * window.innerWidth + "px";

  // random size
  const size = 10 + Math.random() * 20;
  petal.style.width = size + "px";
  petal.style.height = size + "px";

  // random animation duration
  const duration = 5 + Math.random() * 10;
  petal.style.animationDuration = duration + "s";

  // random delay
  petal.style.animationDelay = Math.random() * 5 + "s";

  document.getElementById("petals-container").appendChild(petal);

  // remove after animation ends
  setTimeout(() => {
    petal.remove();
  }, duration * 1000);
}

// keep generating petals
setInterval(createPetal, 500); // every 0.5s new petal

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


