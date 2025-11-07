/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories, getDoubanList } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);

  // 新增：已有 animeList / shortDramaList 状态（沿用你文件里的命名）
  const [animeList, setAnimeList] = useState<any[]>([]);
  const [shortDramaList, setShortDramaList] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  // SiteProvider 中的全局公告
  const { siteName, announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);

  // 初始化公告弹窗的显示状态
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const localStorage = window.localStorage;
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // 收藏夹数据
  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
  };

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    const fetchDoubanData = async () => {
      try {
        setLoading(true);

        // 并行获取热门电影、热门剧集、热门综艺 + 动漫 + 短剧
        const [moviesData, tvShowsData, varietyShowsData, animeData, shortDramaData] = await Promise.all([
          getDoubanCategories({
            kind: 'movie',
            category: '热门',
            type: '全部',
          }),
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
          getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
          // 动漫（豆瓣内置 tv_animation）
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv_animation' }),
          // 短剧（标签检索）
          getDoubanList({ tag: '短剧', type: 'tv', pageStart: 0, pageLimit: 25 }),
        ]);

        if (moviesData.code === 200) {
          setHotMovies(moviesData.list);
        }

        if (tvShowsData.code === 200) {
          setHotTvShows(tvShowsData.list);
        }

        if (varietyShowsData.code === 200) {
          setHotVarietyShows(varietyShowsData.list);
        }

        if (animeData.code === 200) {
          setAnimeList(animeData.list);
        }

        if (shortDramaData.code === 200) {
          setShortDramaList(shortDramaData.list);
        }
      } catch (error) {
        console.error('获取豆瓣数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDoubanData();
  }, []);

  // 处理收藏数据更新的函数
  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    // 根据保存时间排序（从近到远）
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        // 查找对应的播放记录，获取当前集数
        const playRecord = allPlayRecords[key];
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title || '',
          poster: fav.pic || '',
          episodes: fav.total || 0,
          source_name: fav.from || '',
          currentEpisode,
          search_title: fav.search_title,
        };
      });

    setFavoriteItems(sorted as FavoriteItem[]);
  };

  // 初始化收藏夹数据 + 订阅收藏/进度变更
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        const data = await getAllFavorites();
        await updateFavoriteItems(data);

        unsubscribe = subscribeToDataUpdates(async (payload) => {
          if (payload.type === 'collectionsUpdated' || payload.type === 'playRecordUpdated') {
            const latestFavorites = await getAllFavorites();
            await updateFavoriteItems(latestFavorites);
          }
        });
      } catch (err) {
        console.error('初始化收藏数据失败:', err);
      }
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleClearFavorites = async () => {
    try {
      const result = await clearAllFavorites();
      if (result) {
        setFavoriteItems([]);
        console.log('已清空收藏夹');
      }
    } catch (err) {
      console.error('清空收藏夹失败:', err);
    }
  };

  return (
    <PageLayout activePath='/'>
      {/* 顶部切换 */}
      <div className='sticky top-0 z-10 bg-white/80 backdrop-blur md:relative md:bg-transparent md:backdrop-blur-none dark:bg-black/80 md:dark:bg-transparent'>
        <div className='max-w-[95%] mx-auto py-2'>
          <CapsuleSwitch
            tabs={[
              { label: '首页', value: 'home' },
              { label: '收藏夹', value: 'favorites' },
            ]}
            value={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
          />
        </div>
      </div>

      <div className='max-w-[95%] mx-auto'>
        {activeTab === 'favorites' ? (
          // 收藏夹视图
          <section className='mb-8'>
            <div className='mb-4 flex items-center justify-between'>
              <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>我的收藏</h2>
              {favoriteItems.length > 0 && (
                <button
                  className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  onClick={handleClearFavorites}
                >
                  清空收藏
                </button>
              )}
            </div>
            {favoriteItems.length > 0 ? (
              <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'>
                {favoriteItems.map((item) => (
                  <div key={`${item.source}+${item.id}`} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                    <VideoCard
                      from={item.source}
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.id}
                      rate={undefined}
                      year={undefined}
                      currentEpisode={item.currentEpisode}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-sm text-gray-500 dark:text-gray-400'>暂无收藏内容</div>
            )}
          </section>
        ) : (
          // 首页视图
          <>
            {/* 继续观看 */}
            <ContinueWatching />

            {/* 热门电影 */}
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>热门电影</h2>
                <Link
                  href='/douban?type=movie'
                  className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                >
                  查看更多
                  <ChevronRight className='w-4 h-4 ml-1' />
                </Link>
              </div>
              <ScrollableRow>
                {loading
                  ? // 加载状态显示灰色占位数据
                    Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                          <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                        </div>
                        <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                      </div>
                    ))
                  : // 显示真实数据
                    hotMovies.map((movie, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <VideoCard
                          from='douban'
                          title={movie.title}
                          poster={movie.poster}
                          douban_id={movie.id}
                          rate={movie.rate}
                          year={movie.year}
                        />
                      </div>
                    ))}
              </ScrollableRow>
            </section>

            {/* 热门剧集 */}
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>热门剧集</h2>
                <Link
                  href='/douban?type=tv'
                  className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                >
                  查看更多
                  <ChevronRight className='w-4 h-4 ml-1' />
                </Link>
              </div>
              <ScrollableRow>
                {loading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                          <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                        </div>
                        <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                      </div>
                    ))
                  : hotTvShows.map((show, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <VideoCard
                          from='douban'
                          title={show.title}
                          poster={show.poster}
                          douban_id={show.id}
                          rate={show.rate}
                          year={show.year}
                        />
                      </div>
                    ))}
              </ScrollableRow>
            </section>

            {/* 热门综艺 */}
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>热门综艺</h2>
                <Link
                  href='/douban?type=show'
                  className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                >
                  查看更多
                  <ChevronRight className='w-4 h-4 ml-1' />
                </Link>
              </div>
              <ScrollableRow>
                {loading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                          <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                        </div>
                        <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                      </div>
                    ))
                  : hotVarietyShows.map((show, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <VideoCard
                          from='douban'
                          title={show.title}
                          poster={show.poster}
                          douban_id={show.id}
                          rate={show.rate}
                          year={show.year}
                        />
                      </div>
                    ))}
              </ScrollableRow>
            </section>

            {/* 热门动漫 */}
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>热门动漫</h2>
                <Link
                  href='/douban?type=tv&secondary=tv_animation'
                  className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                >
                  查看更多
                  <ChevronRight className='w-4 h-4 ml-1' />
                </Link>
              </div>
              <ScrollableRow>
                {loading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                          <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                        </div>
                        <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                      </div>
                    ))
                  : animeList.map((show, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <VideoCard
                          from='douban'
                          title={show.title}
                          poster={show.poster}
                          douban_id={show.id}
                          rate={show.rate}
                          year={show.year}
                        />
                      </div>
                    ))}
              </ScrollableRow>
            </section>

            {/* 热门短剧 */}
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>热门短剧</h2>
                <Link
                  href='/douban?type=custom&primary=tv&secondary=短剧'
                  className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                >
                  查看更多
                  <ChevronRight className='w-4 h-4 ml-1' />
                </Link>
              </div>
              <ScrollableRow>
                {loading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                          <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                        </div>
                        <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                      </div>
                    ))
                  : shortDramaList.map((show, index) => (
                      <div key={index} className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'>
                        <VideoCard
                          from='douban'
                          title={show.title}
                          poster={show.poster}
                          douban_id={show.id}
                          rate={show.rate}
                          year={show.year}
                        />
                      </div>
                    ))}
              </ScrollableRow>
            </section>
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
