import type { StreamTweet } from '@/types/tweetStream';

const MAX_STREAM_TWEETS = 500;

// Use global to persist across hot reloads in development
// and ensure single instance across module boundaries
declare global {
  var __tweetStreamStore: StreamTweet[] | undefined;
  var __tweetSequence: number | undefined;
}

// Initialize from global or create new
if (!global.__tweetStreamStore) {
  global.__tweetStreamStore = [];
}
if (global.__tweetSequence === undefined) {
  global.__tweetSequence = 0;
}

export const TweetStream = {
  add(tweet: { id: string; influencer: string; tweet: string; createdAt: string }) {
    const entry: StreamTweet = {
      ...tweet,
      timestamp: new Date(tweet.createdAt).getTime(),
      sequence: ++global.__tweetSequence!
    };

    global.__tweetStreamStore = [entry, ...global.__tweetStreamStore!.filter(t => t.id !== entry.id)];

    if (global.__tweetStreamStore.length > MAX_STREAM_TWEETS) {
      global.__tweetStreamStore = global.__tweetStreamStore.slice(0, MAX_STREAM_TWEETS);
    }

    console.log(`🐦 [TWEET_STREAM] Added tweet #${entry.sequence} from @${tweet.influencer} (total: ${global.__tweetStreamStore.length})`);
  },

  getRecent(limit = 50, since?: number): StreamTweet[] {
    const store = global.__tweetStreamStore ?? [];
    const filtered = since
      ? store.filter(tweet => tweet.sequence > since)
      : store;
    
    console.log(`🐦 [TWEET_STREAM] getRecent called - total: ${store.length}, since: ${since ?? 'none'}, returning: ${filtered.slice(0, limit).length}`);
    return filtered.slice(0, limit);
  },

  getLatestSequence(): number {
    return global.__tweetSequence ?? 0;
  },

  // Debug method to check store status
  getStatus(): { total: number; sequence: number } {
    return {
      total: global.__tweetStreamStore?.length ?? 0,
      sequence: global.__tweetSequence ?? 0
    };
  }
};
