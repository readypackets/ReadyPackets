-- Placeholder files are opt-in. Existing Phase Kickoff configurations retain their explicit choices.
ALTER TABLE `phase_kickoff_configs`
  ALTER `attach_placeholders` SET DEFAULT 0;
