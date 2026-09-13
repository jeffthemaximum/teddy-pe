namespace :users do
  desc "Create or update a user. EMAIL= NAME= ROLE=coach|athlete|viewer [PASSWORD=]"
  task create: :environment do
    email = ENV.fetch("EMAIL").strip.downcase
    # Generated and printed once. Nothing is ever committed or seeded.
    password = ENV["PASSWORD"].presence || SecureRandom.alphanumeric(20)

    user = User.find_or_initialize_by(email: email)
    user.assign_attributes(name: ENV.fetch("NAME"), role: ENV.fetch("ROLE"), password: password)
    user.save!

    puts "#{user.email}  #{user.role}"
    puts "password: #{password}"
    puts "Change it after the first sign-in. This is the only time it is shown."
  end

  desc "Link a user to the athlete record. EMAIL="
  task link_athlete: :environment do
    user = User.find_by!(email: ENV.fetch("EMAIL").strip.downcase)
    athlete = Athlete.first or abort("No athlete yet. Run content:seed first.")
    athlete.update!(user: user)
    puts "#{athlete.name} is now #{user.email}"
  end
end
