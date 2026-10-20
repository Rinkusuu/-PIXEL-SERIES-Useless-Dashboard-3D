/* ============================================================================
   quotes.js — the NPC's dialogue.

   Strategy: a bundled pool FIRST, network second. The public quote APIs are
   flaky (quotable.io has had multi-week outages, and its cert has expired more
   than once). A dialogue box that says "Loading…" forever is a broken NPC, so
   the local pool is the product and the network is a bonus that quietly widens
   it when it happens to work.

   The pool is curated for the mood of this thing: gentle, a little wry, mostly
   about rest and small things. No hustle quotes. This is a dashboard whose
   entire thesis is that you don't have to do anything.
   ========================================================================== */

const POOL = [
  { text: 'The quieter you become, the more you are able to hear.', author: 'Ram Dass' },
  { text: 'Nature does not hurry, yet everything is accomplished.', author: 'Lao Tzu' },
  { text: 'Almost everything will work again if you unplug it for a few minutes. Including you.', author: 'Anne Lamott' },
  { text: 'Rest is not idleness. To lie sometimes on the grass under trees, listening to the murmur of water, is by no means a waste of time.', author: 'John Lubbock' },
  { text: 'How we spend our days is, of course, how we spend our lives.', author: 'Annie Dillard' },
  { text: 'Adopt the pace of nature: her secret is patience.', author: 'Ralph Waldo Emerson' },
  { text: 'There is no Wi-Fi in the forest, but I promise you will find a better connection.', author: 'Anonymous' },
  { text: 'You are allowed to be both a masterpiece and a work in progress simultaneously.', author: 'Sophia Bush' },
  { text: 'Slow down and everything you are chasing will come around and catch you.', author: 'John De Paola' },
  { text: 'The best thing one can do when it is raining is to let it rain.', author: 'Henry Wadsworth Longfellow' },
  { text: 'Doing nothing often leads to the very best of something.', author: 'Winnie the Pooh' },
  { text: 'In every walk with nature one receives far more than he seeks.', author: 'John Muir' },
  { text: 'It is a happiness to wonder; it is a happiness to dream.', author: 'Edgar Allan Poe' },
  { text: 'Tension is who you think you should be. Relaxation is who you are.', author: 'Chinese Proverb' },
  { text: 'Do not ask what the world needs. Ask what makes you come alive.', author: 'Howard Thurman' },
  { text: 'The mountains are calling and I must go.', author: 'John Muir' },
  { text: 'Sometimes the most productive thing you can do is rest.', author: 'Mark Black' },
  { text: 'Little by little, one travels far.', author: 'J. R. R. Tolkien' },
  { text: 'Not all those who wander are lost.', author: 'J. R. R. Tolkien' },
  { text: 'The world is full of magic things, patiently waiting for our senses to grow sharper.', author: 'W. B. Yeats' },
  { text: 'To be idle requires a strong sense of personal identity.', author: 'Robert Louis Stevenson' },
  { text: 'Silence is a source of great strength.', author: 'Lao Tzu' },
  { text: 'Smell the sea, and feel the sky. Let your soul and spirit fly.', author: 'Van Morrison' },
  { text: 'A day spent doing nothing is not a day wasted. It is a day spent being.', author: 'Anonymous' },
  { text: 'Look deep into nature, and then you will understand everything better.', author: 'Albert Einstein' },
  { text: 'The clearest way into the universe is through a forest wilderness.', author: 'John Muir' },
  { text: 'Everything you can imagine is real.', author: 'Pablo Picasso' },
  { text: 'You do not have to be productive to be worthy of rest.', author: 'Anonymous' },
  { text: 'Time you enjoy wasting is not wasted time.', author: 'Marthe Troly-Curtin' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'And into the forest I go, to lose my mind and find my soul.', author: 'John Muir' },
  { text: 'The sun does not rise because you set an alarm.', author: 'Anonymous' },
  { text: 'Wherever you are, be there totally.', author: 'Eckhart Tolle' },
  { text: 'Have nothing in your house that you do not know to be useful, or believe to be beautiful.', author: 'William Morris' },
  { text: 'A leaf fell. Nothing else happened. It was a perfect afternoon.', author: 'Anonymous' },
  { text: 'Stars cannot shine without darkness.', author: 'D. H. Sidebottom' },
  { text: 'Be like a tree and let the dead leaves drop.', author: 'Rumi' },
  { text: 'The best time for new beginnings is now.', author: 'Anonymous' },
  { text: 'What good is the warmth of summer, without the cold of winter to give it sweetness?', author: 'John Steinbeck' },
  { text: 'Every hour of every day is an unspeakably perfect miracle.', author: 'Walt Whitman' },
];

/** Recently-shown indices, so the same quote doesn't come up twice in a row. */
const recent = [];
const RECENT_MAX = 12;

function localQuote() {
  let i;
  let guard = 0;
  do {
    i = Math.floor(Math.random() * POOL.length);
  } while (recent.includes(i) && ++guard < 40);

  recent.push(i);
  if (recent.length > RECENT_MAX) recent.shift();

  return { ...POOL[i], source: 'local' };
}

/**
 * Try the network, but never wait long and never let it break anything.
 * dummyjson is used because it is CORS-open, has no key, and — unlike the
 * more famous quote APIs — has actually been up every time I've checked.
 */
async function remoteQuote() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch('https://dummyjson.com/quotes/random', { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    if (!d?.quote || !d?.author) throw new Error('shape');
    return { text: d.quote, author: d.author, source: 'remote' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get a quote. Resolves immediately from the pool most of the time; occasionally
 * reaches for the network to keep things fresh. Always resolves.
 */
export async function getQuote({ preferRemote = false } = {}) {
  // A 1-in-3 reach for the network. Always trying it would put a 3.5s ceiling
  // on the "Next" button for anyone with a bad connection; never trying it
  // makes the pool feel finite after a while.
  const tryNet = preferRemote || Math.random() < 0.34;
  if (tryNet) {
    const q = await remoteQuote();
    if (q) return q;
  }
  return localQuote();
}

export const QUOTE_COUNT = POOL.length;
