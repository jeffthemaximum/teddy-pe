class ProgramYear < ApplicationRecord
  def self.current_for(_athlete, on: Date.current) = nil
end
