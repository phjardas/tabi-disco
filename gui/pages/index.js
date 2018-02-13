import React from 'react';
import { Container } from 'reactstrap';

import { withRedux, loadSongs, getCurrentSong, synchronize, playSong, deleteSong, uploadSong, stopSong } from '../redux';
import Layout from '../components/Layout';
import Dashboard from '../components/Dashboard';

class Home extends React.Component {
  static async getInitialProps({ store }) {
    await Promise.all([store.dispatch(loadSongs()), store.dispatch(getCurrentSong())]);
    return {};
  }

  render() {
    const { songs, currentSong, dispatch } = this.props;

    return (
      <Layout>
        <Dashboard
          songs={songs}
          currentSong={currentSong}
          play={tokenId => dispatch(playSong(tokenId))}
          deleteSong={tokenId => dispatch(deleteSong(tokenId))}
          uploadSong={file => dispatch(uploadSong(file))}
          stopSong={() => dispatch(stopSong())}
        />
      </Layout>
    );
  }

  componentWillMount() {
    this.props.dispatch(synchronize());
  }
}

export default withRedux(state => ({ songs: state.songs, currentSong: state.currentSong }))(Home);
