export type AchievementBinderReward = {
  achievementId: string;
  key: string;
  label: string;
  source: any;
};

export const ACHIEVEMENT_BINDER_REWARDS: AchievementBinderReward[] = [
  { achievementId: 'L001', key: 'reward-l001-collection-titan', label: 'Collection Titan', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l001_collection_titan.png') },
  { achievementId: 'L002', key: 'reward-l002-master-set-maker', label: 'Master Set Maker', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l002_master_set_maker.png') },
  { achievementId: 'L003', key: 'reward-l003-triple-crown-collector', label: 'Triple Crown Collector', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l003_triple_crown_collector.png') },
  { achievementId: 'L004', key: 'reward-l004-museum-vault', label: 'Museum Vault', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l004_museum_vault.png') },
  { achievementId: 'L005', key: 'reward-l005-archive-immortal', label: 'Archive Immortal', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l005_archive_immortal.png') },
  { achievementId: 'L006', key: 'reward-l006-crown-jewel', label: 'Crown Jewel', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l006_crown_jewel.png') },
  { achievementId: 'L007', key: 'reward-l007-four-figure-find', label: 'Four-Figure Find', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l007_four_figure_find.png') },
  { achievementId: 'L008', key: 'reward-l008-top-ten-vault', label: 'Top Ten Vault', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l008_top_ten_vault.png') },
  { achievementId: 'L009', key: 'reward-l009-vault-curator', label: 'Vault Curator', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l009_vault_curator.png') },
  { achievementId: 'L010', key: 'reward-l010-slabbed-grail', label: 'Slabbed Grail', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l010_slabbed_grail.png') },
  { achievementId: 'L011', key: 'reward-l011-pristine-cabinet', label: 'Pristine Cabinet', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l011_pristine_cabinet.png') },
  { achievementId: 'L012', key: 'reward-l012-slab-collector-elite', label: 'Slab Collector Elite', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l012_slab_collector_elite.png') },
  { achievementId: 'L013', key: 'reward-l013-trade-titan', label: 'Trade Titan', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l013_trade_titan.png') },
  { achievementId: 'L014', key: 'reward-l014-high-roller-trade', label: 'High Roller Trade', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l014_high_roller_trade.png') },
  { achievementId: 'L015', key: 'reward-l015-trusted-trader-elite', label: 'Trusted Trader Elite', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l015_trusted_trader_elite.png') },
  { achievementId: 'L016', key: 'reward-l016-market-veteran', label: 'Market Veteran', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l016_market_veteran.png') },
  { achievementId: 'L017', key: 'reward-l017-card-commerce-king', label: 'Card Commerce King', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l017_card_commerce_king.png') },
  { achievementId: 'L018', key: 'reward-l018-unbreakable', label: 'Unbreakable', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l018_unbreakable.png') },
  { achievementId: 'L019', key: 'reward-l019-stackr-master', label: 'Stackr Master', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l019_stackr_master.png') },
  { achievementId: 'L020', key: 'reward-l020-founding-collector', label: 'Founding Collector', source: require('../assets/rev2/07-achievements/binder-rewards/legendary/binder_reward_l020_founding_collector.png') },
  { achievementId: 'HG001', key: 'reward-hg001-the-chosen-one', label: 'The Chosen One', source: require('../assets/rev2/07-achievements/binder-rewards/god-tier/binder_reward_hg001_the_chosen_one.png') },
  { achievementId: 'HG002', key: 'reward-hg002-perfect-vault', label: 'Perfect Vault', source: require('../assets/rev2/07-achievements/binder-rewards/god-tier/binder_reward_hg002_perfect_vault.png') },
  { achievementId: 'HG003', key: 'reward-hg003-set-in-stone', label: 'Set in Stone', source: require('../assets/rev2/07-achievements/binder-rewards/god-tier/binder_reward_hg003_set_in_stone.png') },
  { achievementId: 'HG004', key: 'reward-hg004-untouchable', label: 'Untouchable', source: require('../assets/rev2/07-achievements/binder-rewards/god-tier/binder_reward_hg004_untouchable.png') },
  { achievementId: 'HG005', key: 'reward-hg005-stackr-deity', label: 'Stackr Deity', source: require('../assets/rev2/07-achievements/binder-rewards/god-tier/binder_reward_hg005_stackr_deity.png') },
];

export function getAchievementBinderReward(achievementId: string) {
  return ACHIEVEMENT_BINDER_REWARDS.find((reward) => reward.achievementId === achievementId) ?? null;
}
