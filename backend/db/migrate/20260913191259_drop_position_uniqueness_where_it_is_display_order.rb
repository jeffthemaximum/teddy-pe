class DropPositionUniquenessWhereItIsDisplayOrder < ActiveRecord::Migration[8.0]
  def change
    # Position is display order, not identity. Blocks are identified by key
    # and ball gates by the progression they guard, both of which hold still.
    # Enforcing uniqueness on the ordinal meant that reordering the content
    # made the seeder write a position another row still held, and Postgres
    # rejected the transient duplicate before the loop could finish.
    remove_index :ball_gates, column: %i[program_year_id position], unique: true
    remove_index :blocks, column: %i[program_year_id position], unique: true
  end
end
