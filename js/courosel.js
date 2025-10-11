// Smooth step-by-step carousel
const track = document.querySelector(".logo-track");
const items = document.querySelectorAll(".logo-item");
const totalItems = items.length / 2; // since we duplicated them

let index = 0;

function moveCarousel() {
  index++;
  if (index >= totalItems) {
    track.style.transition = "none";
    index = 0;
    track.style.transform = `translateX(0)`;
    setTimeout(() => {
      track.style.transition = "transform 1s ease-in-out";
      moveCarousel();
    }, 50);
  } else {
    const shift = -index * (items[0].offsetWidth + 40); // item + padding gap
    track.style.transform = `translateX(${shift}px)`;
  }
}

// Move every 3 seconds
setInterval(moveCarousel, 3000);

