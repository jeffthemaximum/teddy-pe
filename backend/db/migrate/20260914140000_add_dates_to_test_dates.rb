# The range a test window covers, as dates rather than as the prose in
# `display`. Nullable in the column and required on the model, deliberately:
# the migration has to be able to run against production before the seed
# that fills the five existing rows does, and `fly deploy` runs them in that
# order. Nothing can write a row without them, because the model says so.
class AddDatesToTestDates < ActiveRecord::Migration[8.0]
  def change
    add_column :test_dates, :starts_on, :date
    add_column :test_dates, :ends_on, :date
  end
end
