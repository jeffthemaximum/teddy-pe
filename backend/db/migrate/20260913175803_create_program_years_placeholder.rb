class CreateProgramYearsPlaceholder < ActiveRecord::Migration[8.0]
  def change
    create_table :program_years do |t|
      t.timestamps
    end
  end
end
